import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.HISTORY_TABLE || 'prompt-cv-history';

export interface HistoryRecord {
  userId: string;
  documentId: string;
  createdAt: number;
  email: string;
  documentUrl: string;
  status: string;
  cvData?: string;
  stats?: string;
  templateDocId?: string;
  templateContent?: string;
  contextContent?: string;
  instructionsContent?: string;
}

class HistoryStore {
  async save(record: HistoryRecord): Promise<void> {
    // Strip undefined values to avoid DynamoDB errors
    const item: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) item[key] = value;
    }
    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`[history-store] Saved history for user ${record.userId}, doc ${record.documentId}`);
  }

  async getForUser(userId: string, limit = 50): Promise<HistoryRecord[]> {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      Limit: limit,
    }));
    const items = (result.Items || []) as HistoryRecord[];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getAll(limit = 100): Promise<HistoryRecord[]> {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      Limit: limit,
    }));
    const items = (result.Items || []) as HistoryRecord[];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateStatus(userId: string, documentId: string, status: string): Promise<void> {
    await client.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, documentId },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ConditionExpression: 'attribute_exists(userId)',
    }));
  }
}

export const historyStore = new HistoryStore();
