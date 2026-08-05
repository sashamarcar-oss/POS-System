from rest_framework.permissions import BasePermission
from rest_framework.exceptions import NotFound

# Ordered lowest -> highest. Anyone at or above `required_rank` passes.
ROLE_RANK = {
    "cashier": 1,
    "manager": 2,
    "owner": 3,
}


class IsBusinessMember(BasePermission):
    """
    Resolves the X-Business-Id header against the authenticated user's
    memberships and attaches request.business / request.membership on success.

    Every tenant-scoped view includes this permission (via TenantScopedViewSet).
    MinimumRole(...) below assumes this has already run and set request.membership.
    """

    message = "You do not have access to this business."

    def has_permission(self, request, view):
        business_id = request.headers.get("X-Business-Id")
        if not business_id:
            raise NotFound("X-Business-Id header is required.")

        membership = (
            request.user.memberships.select_related("business")
            .filter(business_id=business_id, business__is_active=True)
            .first()
        )
        if not membership:
            return False

        request.business = membership.business
        request.membership = membership
        return True


def MinimumRole(role):
    """
    Permission factory. Use in a viewset's get_permissions() to require at
    least `role` (cashier < manager < owner) for specific actions, e.g.:

        def get_permissions(self):
            perms = super().get_permissions()
            if self.action in ("update", "partial_update", "destroy"):
                perms.append(MinimumRole("manager")())
            return perms

    Must run after IsBusinessMember has set request.membership.
    """

    required_rank = ROLE_RANK[role]

    class _MinimumRole(BasePermission):
        message = f"This action requires the '{role}' role or higher."

        def has_permission(self, request, view):
            membership = getattr(request, "membership", None)
            if not membership:
                return False
            return ROLE_RANK.get(membership.role, 0) >= required_rank

    return _MinimumRole
