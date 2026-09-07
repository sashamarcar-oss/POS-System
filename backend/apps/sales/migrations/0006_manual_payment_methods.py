from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0005_payment_provider_payment_reference_payment_status_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="payment",
            name="method",
            field=models.CharField(
                choices=[("cash", "Cash"), ("mobile_money", "M-Pesa")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="payment",
            name="provider",
            field=models.CharField(
                choices=[("manual", "Manual")],
                default="manual",
                max_length=20,
            ),
        ),
    ]