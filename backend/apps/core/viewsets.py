from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .permissions import IsBusinessMember


class TenantScopedViewSet(viewsets.ModelViewSet):
    """
    Base for every business-owned resource.

    - IsAuthenticated + IsBusinessMember run for every action: they require
      a valid X-Business-Id header and an active membership on that
      business, and attach request.business / request.membership.
    - get_queryset() auto-scopes to that business.
    - perform_create() stamps `business` on new rows.

    Subclasses that need role restrictions on specific actions (e.g. only
    managers can delete) override get_permissions() and append
    MinimumRole("manager")() etc. for those actions -- see catalog/inventory
    views.py for examples.
    """

    permission_classes = [IsAuthenticated, IsBusinessMember]

    def get_queryset(self):
        return super().get_queryset().filter(business=self.request.business)

    def perform_create(self, serializer):
        serializer.save(business=self.request.business)
