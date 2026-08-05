from django.contrib import admin
from .models import StockLocation, StockItem, StockMovement

admin.site.register(StockLocation)
admin.site.register(StockItem)
admin.site.register(StockMovement)
