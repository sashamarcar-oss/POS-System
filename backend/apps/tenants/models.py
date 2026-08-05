import uuid
from django.db import models


class Business(models.Model):
    """A tenant. Every business-scoped model links back to this."""

    PLAN_TRIAL = "trial"
    PLAN_STANDARD = "standard"
    PLAN_PRO = "pro"
    PLAN_CHOICES = [
        (PLAN_TRIAL, "Trial"),
        (PLAN_STANDARD, "Standard"),
        (PLAN_PRO, "Pro"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, help_text="Used in subdomain / URLs")
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_TRIAL)
    currency = models.CharField(max_length=3, default="USD")
    timezone = models.CharField(max_length=64, default="UTC")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class BusinessSettings(models.Model):
    """Per-business configuration knobs (receipt footer, tax rules, etc.)."""

    business = models.OneToOneField(Business, on_delete=models.CASCADE, related_name="settings")
    default_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_inclusive_pricing = models.BooleanField(default=False)
    receipt_header = models.CharField(max_length=255, blank=True)
    receipt_footer = models.CharField(max_length=255, blank=True)
    low_stock_threshold_default = models.PositiveIntegerField(default=5)
    accepted_payment_methods = models.JSONField(
        default=list, blank=True,
        help_text="Keys of payment methods accepted at the register, e.g. ['cash', 'card', 'mobile_money', 'other']",
    )

    def __str__(self):
        return f"Settings for {self.business.name}"


class BusinessMembership(models.Model):
    """Links a User to a Business with a role. A user can belong to >1 business."""

    ROLE_OWNER = "owner"
    ROLE_MANAGER = "manager"
    ROLE_CASHIER = "cashier"
    ROLE_CHOICES = [
        (ROLE_OWNER, "Owner"),
        (ROLE_MANAGER, "Manager"),
        (ROLE_CASHIER, "Cashier"),
    ]

    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="memberships")
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_CASHIER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "business")

    def __str__(self):
        return f"{self.user} @ {self.business} ({self.role})"
