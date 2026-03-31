import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.CONFIG_TABLE || 'prompt-cv-config';

export interface ConfigEntry {
  key: string;
  value: string;
  updatedAt?: string;
  updatedBy?: string;
}

class ConfigStore {
  async getAll(): Promise<ConfigEntry[]> {
    const result = await client.send(new ScanCommand({ TableName: TABLE_NAME }));
    return (result.Items || []) as ConfigEntry[];
  }

  async get(key: string): Promise<string | undefined> {
    const result = await client.send(new GetCommand({ TableName: TABLE_NAME, Key: { key } }));
    return (result.Item as ConfigEntry | undefined)?.value;
  }

  async getMultiple(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const result = await client.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys.map((key) => ({ key })) },
      },
    }));
    const items = (result.Responses?.[TABLE_NAME] || []) as ConfigEntry[];
    const map: Record<string, string> = {};
    for (const item of items) map[item.key] = item.value;
    return map;
  }

  async set(key: string, value: string, updatedBy: string): Promise<void> {
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { key, value, updatedAt: new Date().toISOString(), updatedBy },
    }));
  }

  async remove(key: string): Promise<void> {
    await client.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { key } }));
  }
}

export const configStore = new ConfigStore();
