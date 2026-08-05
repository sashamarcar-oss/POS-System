from apps.core.viewsets import TenantScopedViewSet
from apps.core.permissions import MinimumRole
from .models import ProductType, Category, Product, ProductVariant
from .serializers import (
    ProductTypeSerializer, CategorySerializer, ProductSerializer, ProductVariantSerializer,
)

MUTATING_ACTIONS = ("create", "update", "partial_update", "destroy")


class ProductTypeViewSet(TenantScopedViewSet):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms


class CategoryViewSet(TenantScopedViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms


class ProductViewSet(TenantScopedViewSet):
    queryset = Product.objects.select_related("product_type", "category").prefetch_related("variants")
    serializer_class = ProductSerializer
    filterset_fields = ["category", "product_type", "is_active"]

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class ProductVariantViewSet(TenantScopedViewSet):
    queryset = ProductVariant.objects.select_related("product")
    serializer_class = ProductVariantSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in MUTATING_ACTIONS:
            perms.append(MinimumRole("manager")())
        return perms
