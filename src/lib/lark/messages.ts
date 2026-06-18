import { requestLarkWithTenantToken, type LarkResult } from "@/lib/lark/client";

export type LarkReceiveIdType = "chat_id" | "open_id" | "user_id" | "email";

export type LarkMessageResult = {
  messageId: string | null;
};

type LarkMessageResponseData = {
  message_id?: string;
};

export async function sendLarkTextMessage(input: {
  receiveIdType: LarkReceiveIdType;
  receiveId: string;
  text: string;
}): Promise<LarkResult<LarkMessageResult>> {
  const query = new URLSearchParams();
  query.set("receive_id_type", input.receiveIdType);

  const result = await requestLarkWithTenantToken<LarkMessageResponseData>(
    "/open-apis/im/v1/messages",
    {
      method: "POST",
      query,
      body: {
        receive_id: input.receiveId,
        msg_type: "text",
        content: JSON.stringify({ text: input.text }),
      },
    },
  );

  if (!result.ok) return result;
  return { ok: true, data: { messageId: result.data.message_id ?? null } };
}
