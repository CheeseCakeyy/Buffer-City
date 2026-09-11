import { env } from 'cloudflare:workers';
import { visitorsAPI, type VisitorEnvironment } from '../../../../backend/visitors';

export const dynamic = 'force-dynamic';
const handle = (request: Request) => visitorsAPI(request, env as VisitorEnvironment);
export { handle as GET, handle as POST, handle as PATCH };
