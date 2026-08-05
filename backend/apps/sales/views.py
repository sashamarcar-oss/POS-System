from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated

from apps.core.viewsets import TenantScopedViewSet
from apps.core.permissions import MinimumRole
from .models import Customer, Expense, Order, OrderItem, Payment
from .serializers import (
    CustomerSerializer,
    ExpenseSerializer,
    OrderSerializer,
    OrderItemSerializer,
    CheckoutSerializer,
    PaymentSerializer,
)
from .paystack_service import paystack_service


class CustomerViewSet(TenantScopedViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in ("create", "update", "partial_update", "destroy"):
            perms.append(MinimumRole("manager")())
        return perms


class ExpenseViewSet(TenantScopedViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in ("create", "update", "partial_update", "destroy"):
            perms.append(MinimumRole("manager")())
        return perms


class OrderViewSet(TenantScopedViewSet):
    """
    Any business member (cashier+) can ring up and check out a sale.
    Voiding an order requires manager+ -- a cashier shouldn't be able to
    unilaterally cancel a sale without oversight.
    """

    queryset = Order.objects.prefetch_related("items", "payments")
    serializer_class = OrderSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action == "void":
            perms.append(MinimumRole("manager")())
        return perms

    def perform_create(self, serializer):
        serializer.save(business=self.request.business, cashier=self.request.user, status=Order.STATUS_OPEN)

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        order = self.get_object()
        serializer = OrderItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(business=request.business, order=order)
        # The instance from get_object() has a prefetched `items` cache taken
        # before this new item existed; refresh so totals include it.
        order.refresh_from_db()
        order.recalculate_totals()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>[^/.]+)")
    def remove_item(self, request, pk=None, item_id=None):
        order = self.get_object()
        OrderItem.objects.filter(id=item_id, order=order).delete()
        order.recalculate_totals()
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="checkout")
    def checkout(self, request, pk=None):
        order = self.get_object()
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order.checkout(serializer.validated_data["payments"])
        except DjangoValidationError as e:
            message = e.message if hasattr(e, "message") else str(e)
            raise DRFValidationError({"detail": message})
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request, pk=None):
        order = self.get_object()
        if order.status != Order.STATUS_OPEN:
            raise DRFValidationError("Only open orders can be voided.")
        order.status = Order.STATUS_VOID
        order.save(update_fields=["status"])
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="pay-with-paystack")
    def pay_with_paystack(self, request, pk=None):
        """
        Initialize a Paystack payment for this order.
        
        Request body:
        {
            "email": "customer@example.com",
            "customer_name": "John Doe" (optional)
        }
        
        Returns:
        {
            "authorization_url": "https://checkout.paystack.com/...",
            "reference": "PAY_123456",
            "access_code": "..."
        }
        """
        order = self.get_object()
        
        if order.status != Order.STATUS_OPEN:
            raise DRFValidationError({"detail": "Only open orders can be paid."})
        
        if order.total <= 0:
            raise DRFValidationError({"detail": "Order total must be greater than 0."})
        
        email = request.data.get("email")
        customer_name = request.data.get("customer_name")
        
        if not email:
            raise DRFValidationError({"detail": "Email is required."})
        
        try:
            service = paystack_service()
            # Convert amount to kobo (Paystack expects smallest unit)
            amount_kobo = int(order.total * 100)
            result = service.initialize_payment(email, amount_kobo, customer_name)
            
            # Create Payment record with pending status
            Payment.objects.create(
                business=request.business,
                order=order,
                method=Payment.METHOD_CARD,
                amount=order.total,
                status=Payment.STATUS_PENDING,
                provider=Payment.PROVIDER_PAYSTACK,
                reference=result["reference"],
            )
            
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            raise DRFValidationError({"detail": str(e)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def verify_payment(request, reference):
    """
    Verify a Paystack payment by reference.
    
    GET /api/payments/verify/{reference}
    
    This endpoint:
    1. Calls Paystack to verify the payment status
    2. Updates the Payment record
    3. Marks the Order as PAID if successful
    4. Deducts stock if inventory tracking is enabled
    """
    try:
        payment = Payment.objects.get(reference=reference)
        order = payment.order
        
        if payment.business_id != request.business.id:
            return Response(
                {"detail": "Permission denied."},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        # Call Paystack to verify
        service = paystack_service()
        result = service.verify_payment(reference)
        
        if result["status"] == "success":
            # Mark payment as successful
            payment.status = Payment.STATUS_SUCCESS
            payment.verified_at = timezone.now()
            payment.save(update_fields=["status", "verified_at"])
            
            # Mark order as paid
            order.status = Order.STATUS_PAID
            order.paid_at = timezone.now()
            order.save(update_fields=["status", "paid_at"])
            
            # Deduct stock (same as checkout)
            from apps.inventory.models import StockItem, StockMovement
            for item in order.items.select_related("product", "variant", "product__product_type"):
                if item.product.product_type.is_service or not item.product.product_type.tracks_inventory:
                    continue
                if not order.location:
                    continue
                stock_item, _ = StockItem.objects.get_or_create(
                    business=order.business,
                    product=item.product,
                    variant=item.variant,
                    location=order.location,
                    defaults={"quantity_on_hand": 0},
                )
                StockMovement.objects.create(
                    business=order.business,
                    stock_item=stock_item,
                    quantity_delta=-item.quantity,
                    reason=StockMovement.REASON_SALE,
                    reference=str(order.id),
                    created_by=order.cashier,
                )
            
            return Response(
                {
                    "status": "success",
                    "message": "Payment verified and order completed.",
                    "order": OrderSerializer(order).data,
                },
                status=status.HTTP_200_OK,
            )
        else:
            payment.status = Payment.STATUS_FAILED
            payment.save(update_fields=["status"])
            return Response(
                {"detail": f"Payment verification failed: {result['status']}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except Payment.DoesNotExist:
        return Response(
            {"detail": "Payment not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["POST"])
@permission_classes([])
def paystack_webhook(request):
    """
    Paystack webhook endpoint.
    
    This handles payment notifications from Paystack when a payment is completed.
    Webhook signature verification should be added here in production.
    """
    import hmac
    import hashlib
    import json
    from django.conf import settings
    
    # Verify webhook signature (optional but recommended)
    # signature = request.META.get("HTTP_X_PAYSTACK_SIGNATURE", "")
    # body = request.body
    # hash_obj = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), body, hashlib.sha512)
    # if signature != hash_obj.hexdigest():
    #     return Response({"detail": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        data = request.data
        event = data.get("event")
        
        if event == "charge.success":
            reference = data["data"]["reference"]
            payment = Payment.objects.get(reference=reference)
            
            # Mark as successful
            payment.status = Payment.STATUS_SUCCESS
            payment.verified_at = timezone.now()
            payment.save(update_fields=["status", "verified_at"])
            
            # Mark order as paid
            order = payment.order
            order.status = Order.STATUS_PAID
            order.paid_at = timezone.now()
            order.save(update_fields=["status", "paid_at"])
            
            return Response({"status": "success"}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    return Response({"status": "ok"}, status=status.HTTP_200_OK)

