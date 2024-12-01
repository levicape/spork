import { DynamoTable } from "../../server/client/aws/DynamoTable.js";
import type { MagicLinkKey, MagicLinkRow } from "./MagicLinkService.js";

const region = process.env.AWS_REGION || "us-east-1";
const tableName = "qureau_magic_links";

export const QureauMagicLinkTable = new DynamoTable<MagicLinkRow, MagicLinkKey>(
	tableName,
	region,
	(token) => ({ magicLinkId: token }),
);
