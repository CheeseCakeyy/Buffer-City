import { visitorsAPI, type VisitorEnvironment } from './visitors';

export default {
  fetch(request: Request, env: VisitorEnvironment) {
    if (new URL(request.url).pathname !== '/api/visitors') return new Response('Not found', { status: 404 });
    return visitorsAPI(request, env);
  },
};
