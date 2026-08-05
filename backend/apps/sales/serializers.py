from rest_framework import serializers
from .models import Customer, Expense, Order, OrderItem, Payment


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id", "name", "phone", "email", "address", "loyalty_points",
            "credit_balance", "group", "birthday", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ["id", "category", "amount", "expense_date", "payment_method", "status", "note", "created_at"]
        read_only_fields = ["id", "created_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "variant", "quantity", "unit_price", "tax_rate", "discount_amount"]
        read_only_fields = ["id", "unit_price", "tax_rate"]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "method", "amount", "status", "provider", "reference", "created_at", "verified_at"]
        read_only_fields = ["id", "created_at", "verified_at"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "status", "location", "cashier", "subtotal", "tax_total",
            "discount_total", "total", "created_at", "paid_at", "items", "payments",
        ]
        read_only_fields = [
            "id", "status", "subtotal", "tax_total", "discount_total",
            "total", "created_at", "paid_at", "items", "payments",
        ]


class CheckoutSerializer(serializers.Serializer):
    payments = serializers.ListField(
        child=serializers.DictField(), allow_empty=False,
        help_text='[{"method": "cash", "amount": "12.50"}]',
    )
