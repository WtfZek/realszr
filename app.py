from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends, UploadFile, File, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from typing import Dict, Set, List, Optional
import uuid
import asyncio
import random
import os
import shutil
from pathlib import Path

from starlette.middleware.cors import CORSMiddleware

digitalHumansInfo = [
    ['智能助手小美', './static/images/xiaomei.png', '你是一位亲切友好的AI助手，擅长回答各类问题，风格温和有礼。'],
    ['金融顾问李教授', './static/images/lijiaoshou.png', '你是一位资深金融分析师，精通投资理财，能提供专业的金融建议。'],
    ['旅游向导小王', './static/images/xiaowang.png',
     '你是一位热情的旅游向导，熟悉世界各地的景点和文化，能为游客提供旅行建议。'],
    ['厨艺大师陈师傅', './static/images/chenshifu.png',
     '你是一位拥有三十年经验的中餐大厨，擅长各种菜系，能详细讲解烹饪技巧。'],
    ['心理咨询师张医生', './static/images/zhangyisheng.png',
     '你是一位专业的心理咨询师，擅长倾听和共情，能帮助人们解决心理困扰。']
    # ,
    # ['科技专家吴博士', './static/images/wuboshi.png',
    #  '你是一位AI和计算机科学专家，了解最新科技动态，能解释复杂技术概念。'],
    # ['健身教练小林', './static/images/xiaolin.png',
    #  '你是一位专业健身教练，熟悉各种运动和健康知识，能提供个性化健身计划。'],
    # ['音乐老师周老师', './static/images/zhoulaoshi.png',
    #  '你是一位有二十年教学经验的音乐老师，精通钢琴和声乐，能讲解音乐理论。'],
    # ['文学教授赵教授', './static/images/zhaolun.png', '你是一位古典文学教授，熟悉中外文学作品，能进行深入的文学分析。'],
    # ['儿童教育专家黄老师', './static/images/huanglaoshi.png',
    #  '你是一位儿童教育专家，了解儿童心理和发展规律，能提供育儿和教育建议。']
]

# 存储已关联客户端ID的数字人信息
digitalHumans = []

app = FastAPI()

# 创建媒体目录
MEDIA_DIR = Path("./media")
IMAGE_DIR = MEDIA_DIR / "image"
VIDEO_DIR = MEDIA_DIR / "video"
AUDIO_DIR = MEDIA_DIR / "audio"

# 确保目录存在
for dir_path in [IMAGE_DIR, VIDEO_DIR, AUDIO_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# 挂载静态文件目录
app.mount("/media", StaticFiles(directory="media"), name="media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境中应该限制为特定的前端域名
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头
)

# 存储连接和会话
class ConnectionManager:
    def __init__(self):
        # 用户连接 {user_websocket: user_id}
        self.user_connections: Dict[WebSocket, str] = {}
        # 客户机连接 {client_id: client_websocket}
        self.client_connections: Dict[str, WebSocket] = {}
        # 用户当前选择的客户机 {user_id: client_id}
        self.user_selections: Dict[str, str] = {}

    async def connect_user(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self.user_connections[websocket] = user_id
        # 给新连接的用户发送所有可用的客户机列表
        await self.send_client_list_to_user(websocket)

    async def connect_client(self, websocket: WebSocket) -> str:
        await websocket.accept()
        # 为客户机生成一个唯一ID
        client_id = str(uuid.uuid4())
        self.client_connections[client_id] = websocket

        # 随机选择一个数字人信息并关联到客户端ID
        human_info = random.choice(digitalHumansInfo)
        digital_human = {
            "id": client_id,
            "name": human_info[0],
            "imageUrl": human_info[1],
            "prompt": human_info[2]
        }

        # 将关联后的信息添加到digitalHumans列表
        digitalHumans.append(digital_human)

        # 通知所有用户有新的客户机连接
        await self.broadcast_client_list_to_users()
        return client_id

    def disconnect_user(self, websocket: WebSocket) -> None:
        if websocket in self.user_connections:
            user_id = self.user_connections[websocket]
            del self.user_connections[websocket]
            # 清除用户的选择记录
            if user_id in self.user_selections:
                del self.user_selections[user_id]

    async def disconnect_client(self, client_id: str) -> None:
        if client_id in self.client_connections:
            # 获取客户机的WebSocket连接
            client_ws = self.client_connections[client_id]
            # 从客户端连接列表中移除
            del self.client_connections[client_id]

            # 从digitalHumans列表中移除断开连接的客户端
            global digitalHumans
            digitalHumans = [dh for dh in digitalHumans if dh["id"] != client_id]

            # 清除所有与该客户机相关的用户选择
            for user_id, selected_client in list(self.user_selections.items()):
                if selected_client == client_id:
                    del self.user_selections[user_id]
            # 通知所有用户客户机已断开
            await self.broadcast_client_list_to_users()
            # 通知所有之前选择了此客户机的用户
            for user_ws, user_id in self.user_connections.items():
                if user_id in self.user_selections.items() and self.user_selections[user_id] == client_id:
                    await user_ws.send_json({
                        "type": "client_disconnected",
                        "client_id": client_id,
                        "message": "您选择的客户机已断开连接"
                    })

    async def send_client_list_to_user(self, user_websocket: WebSocket) -> None:
        """向特定用户发送客户机列表"""
        await user_websocket.send_json({
            "type": "client_list",
            "clients": list(self.client_connections.keys())
        })

    async def broadcast_client_list_to_users(self) -> None:
        """向所有用户广播客户机列表"""
        for user_ws in self.user_connections:
            await self.send_client_list_to_user(user_ws)

    async def select_client(self, user_id: str, client_id: str) -> bool:
        """用户选择与特定客户机通信"""
        if client_id in self.client_connections:
            self.user_selections[user_id] = client_id
            return True
        return False

    async def send_message_to_client(self, user_id: str, message: str, type: str) -> Dict:
        """用户向选择的客户机发送消息"""
        if user_id not in self.user_selections:
            return {"success": False, "error": "未选择客户机"}

        client_id = self.user_selections[user_id]
        if client_id not in self.client_connections:
            # 客户机不存在，清除选择
            del self.user_selections[user_id]
            return {"success": False, "error": "选择的客户机不可用"}

        client_ws = self.client_connections[client_id]
        await client_ws.send_json({
            "type": "message",
            "user_id": user_id,
            "message": message,
            "new_type": type
        })
        return {"success": True, "client_id": client_id}


# 创建连接管理器实例
manager = ConnectionManager()


# 用户WebSocket接口
@app.websocket("/ws/user/{user_id}")
async def user_websocket(websocket: WebSocket, user_id: str):
    await manager.connect_user(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()

            # 用户选择客户机
            if "select_client" in data:
                client_id = data["select_client"]
                success = await manager.select_client(user_id, client_id)
                await websocket.send_json({
                    "type": "client_selected",
                    "client_id": client_id,
                    "success": success
                })

            # 用户发送消息给选中的客户机
            elif "message" in data:
                print(data)
                result = await manager.send_message_to_client(user_id, data["message"], data["type"])
                if result["success"]:
                    await websocket.send_json({
                        "type": "message_sent",
                        "client_id": result["client_id"],
                        "success": True
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": result["error"]
                    })

            # 用户请求刷新客户机列表
            elif "refresh_clients" in data and data["refresh_clients"]:
                await manager.send_client_list_to_user(websocket)

    except WebSocketDisconnect:
        manager.disconnect_user(websocket)


# 客户机WebSocket接口
@app.websocket("/ws/client")
async def client_websocket(websocket: WebSocket):
    client_id = await manager.connect_client(websocket)

    # 告知客户机它的ID
    await websocket.send_json({
        "type": "connected",
        "client_id": client_id,
        "message": "已连接到服务器"
    })

    try:
        while True:
            data = await websocket.receive_json()

            # 客户机请求断开连接
            if "disconnect" in data and data["disconnect"]:
                await websocket.send_json({
                    "type": "disconnecting",
                    "message": "正在断开连接"
                })
                await manager.disconnect_client(client_id)
                break

    except WebSocketDisconnect:
        await manager.disconnect_client(client_id)


# 获取所有客户机列表的API端点
@app.get("/clients")
async def get_clients():
    # 只返回当前连接的客户端关联的数字人
    connected_digital_humans = [dh for dh in digitalHumans if dh["id"] in manager.client_connections]
    return connected_digital_humans


# 文件上传API端点
@app.post("/upload/{media_type}")
async def upload_file(
    request: Request,
    media_type: str,
    file: UploadFile = File(...),
):
    # 验证媒体类型
    if media_type not in ["image", "video", "audio"]:
        raise HTTPException(status_code=400, detail="不支持的媒体类型，必须是image、video或audio")
    
    # 根据媒体类型选择目录
    if media_type == "image":
        save_dir = IMAGE_DIR
    elif media_type == "video":
        save_dir = VIDEO_DIR
    else:  # audio
        save_dir = AUDIO_DIR
    
    # 为文件名添加UUID前缀，确保唯一性
    name, ext = os.path.splitext(file.filename)
    unique_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = save_dir / unique_filename
    
    try:
        # 创建文件
        with open(file_path, "wb") as buffer:
            # 复制内容
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")
    
    # 获取服务器基础URL
    base_url = f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}"
    
    # 返回文件URL
    file_url = f"/media/{media_type}/{unique_filename}"
    return {
        "success": True,
        "original_filename": file.filename,
        "file_name": unique_filename,
        "file_url": file_url,
        "full_url": f"{base_url}{file_url}"  # 动态生成完整URL
    }


# 获取媒体文件列表
@app.get("/media_list/{media_type}")
async def get_media_list(request: Request, media_type: str):
    if media_type not in ["image", "video", "audio"]:
        raise HTTPException(status_code=400, detail="不支持的媒体类型，必须是image、video或audio")
    
    # 选择目录
    if media_type == "image":
        media_dir = IMAGE_DIR
    elif media_type == "video":
        media_dir = VIDEO_DIR
    else:  # audio
        media_dir = AUDIO_DIR
    
    # 获取服务器基础URL
    # base_url = f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}"

    
    base_url = "http://110.42.226.136:8000"
    
    # 获取目录中的所有文件
    files = []
    for file_path in media_dir.iterdir():
        if file_path.is_file():
            file_url = f"/media/{media_type}/{file_path.name}"
            files.append({
                "name": file_path.name,
                "url": file_url,
                "full_url": f"{base_url}{file_url}",  # 动态生成完整URL
                "size": file_path.stat().st_size,
                "created": file_path.stat().st_ctime
            })
    
    return {"files": files}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000)