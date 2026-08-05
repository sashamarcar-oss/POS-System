import uuid
from django.db import models


class BusinessScopedModel(models.Model):
    """
    Abstract base for every tenant-owned model.
    Guarantees a `business` FK + a manager pattern that call sites use
    to avoid ever accidentally querying across tenants.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        "tenants.Business", on_delete=models.CASCADE, related_name="%(class)ss"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
