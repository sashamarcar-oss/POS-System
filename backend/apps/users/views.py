from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, trim_whitespace=False)
    new_password = serializers.CharField(required=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": "Your current password is incorrect."})
        try:
            validate_password(attrs["new_password"], user)
        except Exception as exc:
            messages = exc.messages if isinstance(exc, ValidationError) else [str(exc)]
            raise serializers.ValidationError({"new_password": messages})
        return attrs


class ChangePasswordView(APIView):
    """POST with {"old_password", "new_password"} to change the caller's password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)
