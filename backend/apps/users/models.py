from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Global identity. Business-specific role lives on BusinessMembership
    (a user can be an owner of one business and a cashier at another).
    """

    phone = models.CharField(max_length=32, blank=True)

    def businesses(self):
        from apps.tenants.models import Business
        return Business.objects.filter(memberships__user=self)

    def role_for(self, business):
        m = self.memberships.filter(business=business).first()
        return m.role if m else None
