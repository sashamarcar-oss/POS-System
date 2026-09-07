from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError

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


