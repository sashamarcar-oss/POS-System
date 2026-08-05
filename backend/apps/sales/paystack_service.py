import requests
import logging
from decimal import Decimal
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

PAYSTACK_API_BASE = "https://api.paystack.co"


class PaystackService:
    def __init__(self):
        self.secret_key = settings.PAYSTACK_SECRET_KEY
        self.public_key = settings.PAYSTACK_PUBLIC_KEY
        self.headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    def initialize_payment(self, email, amount_kobo, customer_name=None):
        """
        Initialize a payment on Paystack.
        
        Args:
            email: Customer email
            amount_kobo: Amount in kobo (smallest currency unit for KES)
            customer_name: Optional customer name
        
        Returns:
            dict with keys: authorization_url, reference, access_code (on success)
            or raises exception on failure
        """
        url = f"{PAYSTACK_API_BASE}/transaction/initialize"
        
        payload = {
            "email": email,
            "amount": int(amount_kobo),
            "currency": "KES",
        }
        
        if customer_name:
            payload["metadata"] = {
                "custom_fields": [
                    {
                        "display_name": "Customer Name",
                        "variable_name": "customer_name",
                        "value": customer_name,
                    }
                ]
            }
        
        try:
            response = requests.post(url, json=payload, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if not data.get("status"):
                logger.error(f"Paystack initialize failed: {data}")
                raise Exception(data.get("message", "Paystack initialization failed"))
            
            return {
                "authorization_url": data["data"]["authorization_url"],
                "reference": data["data"]["reference"],
                "access_code": data["data"]["access_code"],
            }
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack API error: {str(e)}")
            raise Exception(f"Payment service error: {str(e)}")

    def verify_payment(self, reference):
        """
        Verify a payment with Paystack using its reference.
        
        Args:
            reference: Paystack payment reference
        
        Returns:
            dict with payment details if successful
            or raises exception on failure
        """
        url = f"{PAYSTACK_API_BASE}/transaction/verify/{reference}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if not data.get("status"):
                logger.error(f"Paystack verify failed: {data}")
                raise Exception(data.get("message", "Paystack verification failed"))
            
            transaction = data["data"]
            return {
                "status": transaction["status"],
                "reference": transaction["reference"],
                "amount": transaction["amount"],
                "currency": transaction["currency"],
                "customer_email": transaction["customer"]["email"],
                "paid_at": transaction["paid_at"],
                "authorization": transaction.get("authorization", {}),
            }
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack verification API error: {str(e)}")
            raise Exception(f"Payment verification error: {str(e)}")


def paystack_service():
    """Convenience function to get Paystack service instance."""
    return PaystackService()
