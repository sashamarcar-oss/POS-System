from rest_framework import serializers
from .models import StockLocation, StockItem, StockMovement


class StockLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockLocation
        fields = ["id", "name", "is_default", "address", "city", "phone", "manager_name", "is_active"]
        read_only_fields = ["id"]


class StockItemSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = StockItem
        fields = [
            "id", "product", "product_name", "variant", "location",
            "quantity_on_hand", "low_stock_threshold", "is_low_stock",
        ]
        read_only_fields = ["id", "is_low_stock", "product_name"]

    def validate_quantity_on_hand(self, value):
        if self.instance is None and value is None:
            raise serializers.ValidationError("Quantity on hand is required when creating a stock item.")
        return value


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = ["id", "stock_item", "quantity_delta", "reason", "reference", "note", "created_by", "created_at"]
        read_only_fields = ["id", "created_at"]
