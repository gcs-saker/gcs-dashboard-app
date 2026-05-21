import paho.mqtt.client as mqtt

client = mqtt.Client("gcs_backend_pub")
client.connect("165.229.169.127", 1883)  # 도커 브로커 이름으로 연결
client.loop_start()

def publish_control_command(topic: str, message: str):
    print(f"📡 MQTT → {topic}: {message}")
    client.publish(topic, message)
