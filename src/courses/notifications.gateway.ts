import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*', // We can restrict this to frontend URL later
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationsGateway');
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.query.token as string;
      if (!token && client.handshake.headers.cookie) {
        const cookieStr = client.handshake.headers.cookie;
        const jwtCookie = cookieStr
          .split(';')
          .find((c) => c.trim().startsWith('jwt='));
        if (jwtCookie) {
          token = jwtCookie.split('=')[1];
        }
      }

      if (token) {
        const decoded = this.jwtService.verify(token);
        const userId = decoded.userId;
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, []);
        }
        this.userSockets.get(userId)!.push(client.id);
        this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
      } else {
        this.logger.warn(`No token provided for connection: ${client.id}`);
        client.disconnect();
      }
    } catch (err: any) {
      this.logger.warn(
        `Invalid token for connection: ${client.id} - ${err.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      const index = sockets.indexOf(client.id);
      if (index > -1) {
        sockets.splice(index, 1);
        if (sockets.length === 0) {
          this.userSockets.delete(userId);
        }
        this.logger.log(`Client disconnected: ${client.id}`);
        break;
      }
    }
  }

  sendNotificationToUser(userId: string, notification: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('notification', notification);
      });
    }
  }
}
