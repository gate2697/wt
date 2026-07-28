import express from 'express';
import { z } from 'zod';
import { requireBot } from '../middleware/auth.js';
import {
  castMapVote,
  endMapVote,
  getCurrentMapVote,
  getMapVoteBotState,
  hashVoterKey,
  startMapVote,
  voterKeyForRequest
} from '../services/mapVotes.js';

export const mapVotesRouter = express.Router();

mapVotesRouter.get('/current', async (req, res, next) => {
  try {
    const voterHash = hashVoterKey(voterKeyForRequest(req));
    res.json(await getCurrentMapVote({ voterKeyHash: voterHash }));
  } catch (error) { next(error); }
});

mapVotesRouter.post('/vote', async (req, res, next) => {
  try {
    const body = z.object({ mapId: z.coerce.number().int().positive() }).parse(req.body || {});
    const voterKeyHash = hashVoterKey(voterKeyForRequest(req));
    const user = req.session?.user || null;
    const result = await castMapVote(body.mapId, {
      voterKeyHash,
      voterUserId: user?.id || null,
      voterDiscordId: user?.discordId || null,
      voterLabel: user?.username || null
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

// The Discord bot owns the round clock. It ends the current round, receives
// the selected map/link, then calls /start with that map as the live map.
mapVotesRouter.get('/bot/state', requireBot, async (req, res, next) => {
  try { res.json(await getMapVoteBotState()); }
  catch (error) { next(error); }
});

mapVotesRouter.post('/bot/end', requireBot, async (req, res, next) => {
  try {
    const body = z.object({ roundId: z.coerce.number().int().positive().optional() }).parse(req.body || {});
    res.json(await endMapVote({ roundId: body.roundId, actorLabel: 'Discord bot' }));
  } catch (error) { next(error); }
});

mapVotesRouter.post('/bot/start', requireBot, async (req, res, next) => {
  try {
    const body = z.object({
      currentMapId: z.coerce.number().int().positive().nullable().optional(),
      endsAt: z.string().datetime({ offset: true }).optional(),
      durationSeconds: z.coerce.number().int().min(30).max(604800).optional()
    }).parse(req.body || {});
    res.status(201).json(await startMapVote({ ...body, actorLabel: 'Discord bot' }));
  } catch (error) { next(error); }
});
