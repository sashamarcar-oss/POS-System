from django.contrib import admin
from .models import ProductType, Category, Product, ProductVariant

admin.site.register(ProductType)
admin.site.register(Category)
admin.site.register(Product)
admin.site.register(ProductVariant)
