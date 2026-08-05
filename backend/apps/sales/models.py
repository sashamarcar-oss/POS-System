from decimal import Decimal
from django.db import models, transaction
from django.core.exceptions import ValidationError
from apps.core.models import BusinessScopedModel


class Customer(BusinessScopedModel):
    GROUP_VIP = "vip"
    GROUP_LOYALTY = "loyalty"
    GROUP_NEW = "new"
    GROUP_CHOICES = [
        (GROUP_VIP, "VIP"),
        (GROUP_LOYALTY, "Loyalty"),
        (GROUP_NEW, "New"),
    ]

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    loyalty_points = models.PositiveIntegerField(default=0)
    credit_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    group = models.CharField(max_length=20, choices=GROUP_CHOICES, default=GROUP_NEW)
    birthday = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "customers"

    def __str__(self):
        return self.name


class Expense(BusinessScopedModel):
    STATUS_SETTLED = "settled"
    STATUS_PENDING = "pending"
    STATUS_CHOICES = [
        (STATUS_SETTLED, "Settled"),
        (STATUS_PENDING, "Pending"),
    ]

    category = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    payment_method = models.CharField(max_length=50, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.category} - {self.amount}"


class Order(BusinessScopedModel):
    STATUS_OPEN = "open"
    STATUS_PAID = "paid"
    STATUS_VOID = "void"
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_PAID, "Paid"),
        (STATUS_VOID, "Void"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    location = models.ForeignKey(
        "inventory.StockLocation", null=True, on_delete=models.SET_NULL, related_name="orders"
    )
    cashier = models.ForeignKey(
        "users.User", null=True, on_delete=models.SET_NULL, related_name="orders"
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    def recalculate_totals(self):
        # Query through OrderItem directly rather than self.items.all(), which
        # would return a stale prefetched cache if the instance was fetched
        # before its items were added.
        items = list(OrderItem.objects.filter(order=self))
        subtotal = sum((i.line_subtotal for i in items), Decimal("0"))
        tax_total = sum((i.line_tax for i in items), Decimal("0"))
        discount_total = sum((i.line_discount for i in items), Decimal("0"))
        self.subtotal = subtotal
        self.tax_total = tax_total
        self.discount_total = discount_total
        self.total = subtotal + tax_total - discount_total
        self.save(update_fields=["subtotal", "tax_total", "discount_total", "total"])

    @transaction.atomic
    def checkout(self, payments_data):
        """
        payments_data: list of {"method": "cash"/"card"/..., "amount": Decimal}
        Validates full payment, deducts stock for tracked items, marks paid.
        """
        from apps.inventory.models import StockItem, StockMovement

        if self.status != self.STATUS_OPEN:
            raise ValidationError(f"Order is {self.status}, cannot check out.")
        if not self.items.exists():
            raise ValidationError("Cannot check out an empty order.")

        self.recalculate_totals()
        paid_amount = sum((Decimal(str(p["amount"])) for p in payments_data), Decimal("0"))
        if paid_amount < self.total:
            raise ValidationError(
                f"Payment total {paid_amount} is less than order total {self.total}."
            )

        for item in self.items.select_related("product", "variant", "product__product_type"):
            if item.product.product_type.is_service or not item.product.product_type.tracks_inventory:
                continue
            if not self.location:
                raise ValidationError("Order has no location set; required for stock deduction.")
            stock_item, _ = StockItem.objects.get_or_create(
                business=self.business,
                product=item.product,
                variant=item.variant,
                location=self.location,
                defaults={"quantity_on_hand": 0},
            )
            StockMovement.objects.create(
                business=self.business,
                stock_item=stock_item,
                quantity_delta=-item.quantity,
                reason=StockMovement.REASON_SALE,
                reference=str(self.id),
                created_by=self.cashier,
            )

        for p in payments_data:
            Payment.objects.create(
                business=self.business,
                order=self,
                method=p["method"],
                amount=Decimal(str(p["amount"])),
            )

        from django.utils import timezone
        self.status = self.STATUS_PAID
        self.paid_at = timezone.now()
        self.save(update_fields=["status", "paid_at"])
        return self


class OrderItem(BusinessScopedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="order_items")
    variant = models.ForeignKey(
        "catalog.ProductVariant", null=True, blank=True, on_delete=models.PROTECT, related_name="order_items"
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    @property
    def line_subtotal(self):
        return self.quantity * self.unit_price

    @property
    def line_tax(self):
        return (self.line_subtotal - self.discount_amount) * (self.tax_rate / Decimal("100"))

    @property
    def line_discount(self):
        return self.discount_amount

    def save(self, *args, **kwargs):
        if not self.unit_price:
            base = self.variant.price if self.variant else self.product.base_price
            self.unit_price = base
        if self.tax_rate is None or self.tax_rate == 0:
            self.tax_rate = (
                self.product.tax_rate
                if self.product.tax_rate is not None
                else self.business.settings.default_tax_rate
            )
        super().save(*args, **kwargs)


class Payment(BusinessScopedModel):
    METHOD_CASH = "cash"
    METHOD_CARD = "card"
    METHOD_MOBILE = "mobile_money"
    METHOD_OTHER = "other"
    METHOD_CHOICES = [
        (METHOD_CASH, "Cash"),
        (METHOD_CARD, "Card"),
        (METHOD_MOBILE, "Mobile Money"),
        (METHOD_OTHER, "Other"),
    ]

    STATUS_PENDING = "pending"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SUCCESS, "Success"),
        (STATUS_FAILED, "Failed"),
    ]

    PROVIDER_MANUAL = "manual"
    PROVIDER_PAYSTACK = "paystack"
    PROVIDER_CHOICES = [
        (PROVIDER_MANUAL, "Manual"),
        (PROVIDER_PAYSTACK, "Paystack"),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default=PROVIDER_MANUAL)
    reference = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
