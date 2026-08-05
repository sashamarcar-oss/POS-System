from rest_framework.exceptions import ValidationError
from apps.core.viewsets import TenantScopedViewSet
from apps.core.permissions import MinimumRole
from .models import StockLocation, StockItem, StockMovement
from .serializers import StockLocationSerializer, StockItemSerializer, StockMovementSerializer

MUTATING_ACTIONS = ("create", "update", "partial_update", "destroy")


class StockLocationViewSet(TenantScopedViewSet):
    queryset = StockLocation.objects.all()
    serializer_class = StockLocationSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms


class StockItemViewSet(TenantScopedViewSet):
    """Create initial stock when adding products. Mutations via StockMovement thereafter."""

    queryset = StockItem.objects.select_related("product", "variant", "location")
    serializer_class = StockItemSerializer
    http_method_names = ["get", "head", "options", "post"]

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action == "create":
            perms.append(MinimumRole("manager")())
        return perms

    def perform_create(self, serializer):
        serializer.save(business=self.request.business)


class StockMovementViewSet(TenantScopedViewSet):
    """
    Manual stock changes (restock, adjustment, return) require manager+.
    'sale' movements are never created through this endpoint -- they're
    recorded internally by Order.checkout(), bypassing the API entirely.
    """

    queryset = StockMovement.objects.select_related("stock_item")
    serializer_class = StockMovementSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms

    def perform_create(self, serializer):
        if serializer.validated_data.get("reason") == StockMovement.REASON_SALE:
            raise ValidationError(
                {"reason": "Sale movements can only be created by the checkout process."}
            )
        serializer.save(business=self.request.business, created_by=self.request.user)
