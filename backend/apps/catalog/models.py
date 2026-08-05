from django.db import models
from apps.core.models import BusinessScopedModel


class ProductType(BusinessScopedModel):
    """
    Defines a *kind* of sellable thing for this business, e.g. "Retail SKU",
    "Menu Item", "Haircut Service". Controls behavior flags so the same
    checkout/inventory code works for any vertical.
    """

    name = models.CharField(max_length=100)
    tracks_inventory = models.BooleanField(default=True)
    has_variants = models.BooleanField(
        default=False, help_text="e.g. size/color for retail, no for a haircut"
    )
    is_service = models.BooleanField(
        default=False, help_text="Services skip stock deduction entirely"
    )
    # Defines which extra fields this type expects, e.g.
    # {"prep_time_minutes": "integer", "size": "string"}. Purely descriptive —
    # used by the frontend to render the right input fields.
    attribute_schema = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("business", "name")

    def __str__(self):
        return f"{self.name} ({self.business.name})"


class Category(BusinessScopedModel):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )

    class Meta:
        unique_together = ("business", "name", "parent")
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(BusinessScopedModel):
    product_type = models.ForeignKey(ProductType, on_delete=models.PROTECT, related_name="products")
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="products"
    )
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, blank=True)
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Overrides business default_tax_rate if set"
    )
    is_active = models.BooleanField(default=True)
    image = models.ImageField(upload_to="products/", null=True, blank=True)
    # Free-form data matching product_type.attribute_schema, e.g.
    # {"prep_time_minutes": 12} or {"duration_minutes": 45}
    attributes = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("business", "sku")

    def __str__(self):
        return self.name


class ProductVariant(BusinessScopedModel):
    """Only used when product_type.has_variants is True (e.g. Small/Medium/Large)."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=100)
    sku_suffix = models.CharField(max_length=32, blank=True)
    price_delta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    attributes = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("product", "name")

    def __str__(self):
        return f"{self.product.name} - {self.name}"

    @property
    def price(self):
        return self.product.base_price + self.price_delta
