from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.views.generic.base import RedirectView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.catalog.views import ProductTypeViewSet, CategoryViewSet, ProductViewSet, ProductVariantViewSet
from apps.inventory.views import StockLocationViewSet, StockItemViewSet, StockMovementViewSet
from apps.sales.views import CustomerViewSet, ExpenseViewSet, OrderViewSet, verify_payment, paystack_webhook
from apps.tenants.views import MyBusinessesView, TeamMemberViewSet, BusinessSettingsView
from apps.users.views import ChangePasswordView

router = DefaultRouter()
router.register(r"product-types", ProductTypeViewSet, basename="producttype")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"variants", ProductVariantViewSet, basename="variant")
router.register(r"stock-locations", StockLocationViewSet, basename="stocklocation")
router.register(r"stock-items", StockItemViewSet, basename="stockitem")
router.register(r"stock-movements", StockMovementViewSet, basename="stockmovement")
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"expenses", ExpenseViewSet, basename="expense")
router.register(r"orders", OrderViewSet, basename="order")
router.register(r"team", TeamMemberViewSet, basename="teammember")

urlpatterns = [
    path('', RedirectView.as_view(url='/api/', permanent=False)),
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="change_password"),
    path("api/auth/me/businesses/", MyBusinessesView.as_view(), name="my_businesses"),
    path("api/settings/", BusinessSettingsView.as_view(), name="business_settings"),
    path("api/payments/verify/<str:reference>/", verify_payment, name="verify_payment"),
    path("api/payments/webhook/", paystack_webhook, name="paystack_webhook"),
    path("api/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
