import base64
import uuid

from django.core.files.base import ContentFile
from rest_framework import serializers
from .models import ProductType, Category, Product, ProductVariant


class Base64ImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if isinstance(data, str) and data.startswith("data:image"):
            header, imgstr = data.split(";base64,")
            ext = header.split("/")[-1]
            data = ContentFile(base64.b64decode(imgstr), name=f"{uuid.uuid4()}.{ext}")
        return super().to_internal_value(data)


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "tracks_inventory", "has_variants", "is_service", "attribute_schema"]
        read_only_fields = ["id"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "parent"]
        read_only_fields = ["id"]


class ProductVariantSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ProductVariant
        fields = ["id", "product", "name", "sku_suffix", "price_delta", "price", "attributes"]
        read_only_fields = ["id", "price"]


class ProductSerializer(serializers.ModelSerializer):
    variants = ProductVariantSerializer(many=True, read_only=True)
    image = Base64ImageField(required=False, allow_null=True)

    class Meta:
        model = Product
        fields = [
            "id", "product_type", "category", "name", "sku", "description",
            "base_price", "tax_rate", "is_active", "attributes", "variants", "image",
        ]
        read_only_fields = ["id"]
