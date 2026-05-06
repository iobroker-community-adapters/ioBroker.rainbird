#!/usr/bin/env python3
"""
Python bridge for pyrainbird library.
Provides a CLI interface that can be called from Node.js.
"""
import asyncio
import json
import sys
import argparse
import aiohttp
from pyrainbird import async_client


async def execute_command(host: str, password: str, command: str, args: list):
    """Execute a command using the pyrainbird library."""
    try:
        async with aiohttp.ClientSession() as session:
            client = async_client.AsyncRainbirdClient(session, host, password)
            controller = async_client.AsyncRainbirdController(client)
            
            result = {"success": True, "data": None}
            
            if command == "get_model_and_version":
                model_info = await controller.get_model_and_version()
                result["data"] = {
                    "modelID": model_info.model_id,
                    "protocolRevisionMajor": model_info.major,
                    "protocolRevisionMinor": model_info.minor
                }
            
            elif command == "get_available_stations":
                page = int(args[0]) if args else 0
                stations = await controller.get_available_stations(page)
                # Convert the active_set to a list and create a binary mask
                active_list = list(stations.active_set)
                result["data"] = {
                    "count": len(active_list),
                    "stations": active_list
                }
            
            elif command == "get_serial_number":
                serial = await controller.get_serial_number()
                result["data"] = {"serialNumber": serial}
            
            elif command == "get_current_time":
                time_info = await controller.get_current_time()
                result["data"] = {
                    "hour": time_info.hour,
                    "minute": time_info.minute,
                    "second": time_info.second
                }
            
            elif command == "get_current_date":
                date_info = await controller.get_current_date()
                result["data"] = {
                    "year": date_info.year,
                    "month": date_info.month,
                    "day": date_info.day
                }
            
            elif command == "get_rain_sensor_state":
                sensor_state = await controller.get_rain_sensor_state()
                result["data"] = {"sensorState": sensor_state}
            
            elif command == "get_zone_states":
                page = int(args[0]) if args else 0
                states = await controller.get_zone_states(page)
                active_list = list(states.active_set)
                result["data"] = {
                    "activeStations": active_list
                }
            
            elif command == "get_current_irrigation":
                irrigation = await controller.get_current_irrigation()
                result["data"] = {"irrigationState": irrigation}
            
            elif command == "get_rain_delay":
                delay = await controller.get_rain_delay()
                result["data"] = {"delaySetting": delay}
            
            elif command == "set_rain_delay":
                duration = int(args[0]) if args else 0
                await controller.set_rain_delay(duration)
                result["data"] = {"acknowledged": True}
            
            elif command == "irrigate_zone":
                zone = int(args[0]) if len(args) > 0 else 1
                duration = int(args[1]) if len(args) > 1 else 0
                await controller.irrigate_zone(zone, duration)
                result["data"] = {"acknowledged": True}
            
            elif command == "stop_irrigation":
                await controller.stop_irrigation()
                result["data"] = {"acknowledged": True}
            
            elif command == "test_zone":
                zone = int(args[0]) if args else 1
                await controller.test_zone(zone)
                result["data"] = {"acknowledged": True}
            
            elif command == "advance_zone":
                zone = int(args[0]) if args else 0
                await controller.advance_zone(zone)
                result["data"] = {"acknowledged": True}
            
            elif command == "get_water_budget":
                program = int(args[0]) if args else 0
                budget = await controller.get_water_budget(program)
                result["data"] = {
                    "programCode": program,
                    "seasonalAdjust": budget
                }
            
            elif command == "run_program":
                program = int(args[0]) if args else 1
                await controller.run_program(program)
                result["data"] = {"acknowledged": True}
            
            else:
                result["success"] = False
                result["error"] = f"Unknown command: {command}"
            
            return result
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "type": type(e).__name__
        }


def main():
    parser = argparse.ArgumentParser(description='PyRainbird Bridge')
    parser.add_argument('--host', required=True, help='Rain Bird controller IP address')
    parser.add_argument('--password', required=True, help='Rain Bird controller password')
    parser.add_argument('--command', required=True, help='Command to execute')
    parser.add_argument('--args', nargs='*', default=[], help='Command arguments')
    
    args = parser.parse_args()
    
    result = asyncio.run(execute_command(args.host, args.password, args.command, args.args))
    print(json.dumps(result))
    
    sys.exit(0 if result.get("success") else 1)


if __name__ == '__main__':
    main()
