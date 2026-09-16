extends Node
## Godot 4 web-export bridge. Load installGodotBridge in the export HTML first.
## Native/mobile clients need a native transport; this file does not claim one.

signal bridge_ready(methods: Array)
signal bridge_failed(message: String)
signal request_completed(request_id: String, result: Variant)
signal request_failed(request_id: String, message: String)

var _bridge: JavaScriptObject
var _ready_callback: JavaScriptObject
var _response_callback: JavaScriptObject
var _counter := 0

func _ready() -> void:
	if not OS.has_feature("web"):
		bridge_failed.emit("AWEBridge.gd requires a Godot web export.")
		return
	_bridge = JavaScriptBridge.get_interface("AWEGameBridge")
	if _bridge == null:
		bridge_failed.emit("Install AWEGameBridge in the export HTML before starting Godot.")
		return
	# Retain callback objects; otherwise Godot may release them before a response.
	_ready_callback = JavaScriptBridge.create_callback(_on_ready_message)
	_response_callback = JavaScriptBridge.create_callback(_on_response_message)
	_bridge.ready(_ready_callback)

func request(method: String, params: Dictionary) -> String:
	_counter += 1
	var request_id := "godot-%d" % _counter
	if _bridge == null:
		request_failed.emit(request_id, "Bridge is unavailable")
		return request_id
	_bridge.requestJson(method, JSON.stringify(params), request_id, _response_callback)
	return request_id

func _on_ready_message(args: Array) -> void:
	if args.is_empty():
		return
	var message = JSON.parse_string(str(args[0]))
	if not message is Dictionary:
		return
	if message.get("ok", false):
		bridge_ready.emit(message.get("methods", []))
	else:
		bridge_failed.emit(str(message.get("error", "Handshake failed")))

func _on_response_message(args: Array) -> void:
	if args.is_empty():
		return
	var message = JSON.parse_string(str(args[0]))
	if not message is Dictionary:
		return
	var request_id := str(message.get("requestId", ""))
	if message.get("ok", false):
		request_completed.emit(request_id, message.get("result"))
	else:
		request_failed.emit(request_id, str(message.get("error", "Request failed")))
