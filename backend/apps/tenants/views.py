from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated

from apps.core.viewsets import TenantScopedViewSet
from apps.core.permissions import IsBusinessMember, MinimumRole
from .models import BusinessMembership, BusinessSettings
from .serializers import BusinessSettingsSerializer, MyMembershipSerializer, TeamMemberSerializer


class MyBusinessesView(ListAPIView):
    """Lets the frontend show a tenant switcher after login."""

    serializer_class = MyMembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.request.user.memberships.select_related("business")


class BusinessSettingsView(RetrieveUpdateAPIView):
    """
    Read any member can; write requires manager or owner. The business may
    not have a BusinessSettings row yet (created lazily), so fetch-or-create
    it rather than assuming one exists.
    """

    serializer_class = BusinessSettingsSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsAuthenticated(), IsBusinessMember(), MinimumRole("manager")()]
        return [IsAuthenticated(), IsBusinessMember()]

    def get_object(self):
        business = self.request.business
        settings, _ = BusinessSettings.objects.get_or_create(business=business)
        return settings


class TeamMemberViewSet(TenantScopedViewSet):
    """
    Owner-only: manage who belongs to the active business and what role
    they hold. Scoped to X-Business-Id like every other tenant resource.
    """

    queryset = BusinessMembership.objects.select_related("user", "business")
    serializer_class = TeamMemberSerializer

    def get_permissions(self):
        perms = super().get_permissions()
        perms.append(MinimumRole("owner")())
        return perms
