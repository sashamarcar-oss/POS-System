from django.db import models
from django.core.exceptions import ValidationError
from apps.core.models import BusinessScopedModel


class StockLocation(BusinessScopedModel):
    """e.g. 'Main Store', 'Warehouse', 'Kitchen'. Most tenants will have one."""

    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    manager_name = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("business", "name")

    def __str__(self):
        return self.name


class StockItem(BusinessScopedModel):
    """Current on-hand quantity for a product (or variant) at a location."""

    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="stock_items")
    variant = models.ForeignKey(
        "catalog.ProductVariant", null=True, blank=True, on_delete=models.CASCADE, related_name="stock_items"
    )
    location = models.ForeignKey(StockLocation, on_delete=models.CASCADE, related_name="stock_items")
    quantity_on_hand = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    low_stock_threshold = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("product", "variant", "location")

    def __str__(self):
        label = self.variant or self.product
        return f"{label} @ {self.location} ({self.quantity_on_hand})"

    @property
    def is_low_stock(self):
        threshold = self.low_stock_threshold or self.business.settings.low_stock_threshold_default
        return self.quantity_on_hand <= threshold


class StockMovement(BusinessScopedModel):
    """
    Audit trail for every stock change. Never mutate StockItem.quantity_on_hand
    directly outside of StockItem.apply_movement -- this is the append-only log.
    """

    REASON_SALE = "sale"
    REASON_RESTOCK = "restock"
    REASON_ADJUSTMENT = "adjustment"
    REASON_RETURN = "return"
    REASON_CHOICES = [
        (REASON_SALE, "Sale"),
        (REASON_RESTOCK, "Restock"),
        (REASON_ADJUSTMENT, "Manual Adjustment"),
        (REASON_RETURN, "Return"),
    ]

    stock_item = models.ForeignKey(StockItem, on_delete=models.CASCADE, related_name="movements")
    quantity_delta = models.DecimalField(
        max_digits=12, decimal_places=3, help_text="Negative for sales/removals, positive for restocks"
    )
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    reference = models.CharField(
        max_length=100, blank=True, help_text="e.g. related Order id"
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        "users.User", null=True, on_delete=models.SET_NULL, related_name="stock_movements"
    )

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            StockItem.objects.filter(pk=self.stock_item_id).update(
                quantity_on_hand=models.F("quantity_on_hand") + self.quantity_delta
            )
