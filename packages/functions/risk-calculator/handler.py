import json
import sys


def handle(req):
    """
    OpenFaaS Handler for Risk Calculator Function
    Expects JSON input with "temperature" and "vibration" fields
    """
    try:
        data = json.loads(req)
        temp = data.get("temperature", 4.0)
        vibration = data.get("vibration", 0.0)

        issues = []
        status = "SAFE"
        estimated_loss = 0

        if temp > 8.0:
            issues.append(f"Temperature: {temp}°C")
            estimated_loss += (temp - 8.0) * 150
            status = "WARNING"

        if vibration > 4.0:
            issues.append(f"Shock: {vibration}G")
            estimated_loss += vibration * 100
            status = "CRITICAL"

        response = {
            "status": status,
            "issues": issues,
            "estimated_loss": round(estimated_loss, 2),
            "should_alert": len(issues) > 0,
            "audit_engine": "OpenFaaS",
        }

        return json.dumps(response)

    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    input_data = sys.stdin.read()
    print(handle(input_data))
