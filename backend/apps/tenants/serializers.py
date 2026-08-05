from rest_framework import serializers
from .models import Business, BusinessMembership, BusinessSettings


class MyMembershipSerializer(serializers.ModelSerializer):
    """Used by /auth/me/businesses/ -- 'which businesses do I belong to'."""

    business_id = serializers.UUIDField(source="business.id", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    business_slug = serializers.CharField(source="business.slug", read_only=True)
    currency = serializers.CharField(source="business.currency", read_only=True)
    default_tax_rate = serializers.DecimalField(
        source="business.settings.default_tax_rate", max_digits=5, decimal_places=2, read_only=True
    )

    class Meta:
        model = BusinessMembership
        fields = ["business_id", "business_name", "business_slug", "currency", "default_tax_rate", "role"]


class BusinessSettingsSerializer(serializers.ModelSerializer):
    """Read/write a business' details plus its per-business settings knobs.

    Fields drawn from Business (name, currency, timezone...) live on the
    tenant row itself; the rest live on the one-to-one BusinessSettings row.
    update() routes each chunk to the right model so the frontend can PATCH
    them all through a single /settings/ endpoint.
    """

    id = serializers.UUIDField(source="business.id", read_only=True)
    name = serializers.CharField(source="business.name")
    slug = serializers.CharField(source="business.slug", read_only=True)
    plan = serializers.CharField(source="business.plan", read_only=True)
    is_active = serializers.BooleanField(source="business.is_active")
    currency = serializers.CharField(source="business.currency")
    timezone = serializers.CharField(source="business.timezone")

    class Meta:
        model = BusinessSettings
        fields = [
            "id", "name", "slug", "plan", "is_active", "currency", "timezone",
            "default_tax_rate", "tax_inclusive_pricing", "receipt_header",
            "receipt_footer", "low_stock_threshold_default", "accepted_payment_methods",
        ]
        read_only_fields = ["id", "slug", "plan"]

    def update(self, instance, validated_data):
        business_data = validated_data.pop("business", {})
        if business_data:
            for attr, value in business_data.items():
                setattr(instance.business, attr, value)
            instance.business.save()
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class TeamMemberSerializer(serializers.ModelSerializer):
    """
    Used by the owner-only team-management endpoint -- 'who belongs to
    THIS business and what's their role'. Adding a member looks the user
    up by username; it doesn't create accounts (that's a signup concern).
    """

    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    user_username = serializers.CharField(
        write_only=True, required=False, help_text="Username of an existing user to add (create only)"
    )

    class Meta:
        model = BusinessMembership
        fields = ["id", "username", "email", "role", "user_username"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        if self.instance is None and not attrs.get("user_username"):
            raise serializers.ValidationError({"user_username": "This field is required when adding a member."})
        return attrs

    def create(self, validated_data):
        from apps.users.models import User

        username = validated_data.pop("user_username")
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise serializers.ValidationError({"user_username": "No user with that username exists."})

        if BusinessMembership.objects.filter(
            user=user, business=validated_data["business"]
        ).exists():
            raise serializers.ValidationError({"user_username": "This user is already a member of this business."})

        validated_data["user"] = user
        return super().create(validated_data)
