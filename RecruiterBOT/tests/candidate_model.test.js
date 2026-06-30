const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCandidateData, getCandidateQueueRank, shouldShortlistCandidate, mergeCandidateRecords } = require('../shared/candidates');

test('normalizeCandidateData builds a consistent candidate record', () => {
  const candidate = normalizeCandidateData({
    title: 'Senior Engineer',
    url: 'https://www.linkedin.com/in/alice',
    text: 'React, Node, distributed systems',
    source: 'google'
  }, {
    score: 72,
    reason: 'Strong match',
    selected: true
  });

  assert.equal(candidate.name, 'Senior Engineer');
  assert.equal(candidate.url, 'https://www.linkedin.com/in/alice');
  assert.equal(candidate.source, 'google');
  assert.equal(candidate.data_depth, 'result_card');
  assert.equal(candidate.score, 72);
  assert.equal(candidate.reason, 'Strong match');
  assert.equal(candidate.selected, true);
  assert.equal(candidate.profile_payload, undefined);
  assert.equal(candidate.confidence, 'low');
  assert.equal(candidate.evidence_strength, 'provisional');
  assert.equal(candidate.outreach_state, 'new');
  assert.ok(candidate.extracted_at);
});

test('normalizeCandidateData upgrades full-profile payloads', () => {
  const profilePayload = {
    name: 'Alice Example',
    headline: 'Staff Engineer',
    skills: ['React', 'Node.js'],
    location: 'Prague'
  };

  const candidate = normalizeCandidateData({
    title: 'Alice',
    url: 'https://www.linkedin.com/in/alice',
    text: 'Short snippet',
    source: 'linkedin',
    profile_payload: profilePayload,
    extracted_at: '2026-06-29T10:00:00.000Z'
  }, {
    data_depth: 'full_profile',
    score: 88,
    reason: 'Excellent fit',
    selected: true
  });

  assert.equal(candidate.name, 'Alice Example');
  assert.equal(candidate.data_depth, 'full_profile');
  assert.equal(candidate.confidence, 'high');
  assert.equal(candidate.evidence_strength, 'high-confidence');
  assert.equal(candidate.profile_payload.name, 'Alice Example');
  assert.equal(candidate.profile_payload.headline, 'Staff Engineer');
  assert.equal(candidate.extracted_at, '2026-06-29T10:00:00.000Z');
});

test('getCandidateQueueRank strongly prefers full-profile evidence over result-card evidence', () => {
  const weak = normalizeCandidateData({ url: 'https://example.com/a', source: 'google', data_depth: 'result_card' }, { score: 95, reason: 'Provisional' });
  const strong = normalizeCandidateData({ url: 'https://example.com/b', source: 'linkedin', data_depth: 'full_profile' }, { score: 48, reason: 'Strong fit' });

  assert.equal(getCandidateQueueRank(weak), 95);
  assert.equal(getCandidateQueueRank(strong), 1048);
  assert.ok(getCandidateQueueRank(strong) > getCandidateQueueRank(weak));
});

test('shouldShortlistCandidate applies stricter thresholds to result-card evidence', () => {
  const weakResultCard = normalizeCandidateData({ url: 'https://example.com/a', source: 'google', data_depth: 'result_card' }, { score: 60 });
  const strongProfile = normalizeCandidateData({ url: 'https://example.com/b', source: 'linkedin', data_depth: 'full_profile' }, { score: 45 });
  const strongResultCard = normalizeCandidateData({ url: 'https://example.com/c', source: 'google', data_depth: 'result_card' }, { score: 65 });

  assert.equal(shouldShortlistCandidate(weakResultCard), false);
  assert.equal(shouldShortlistCandidate(strongProfile), true);
  assert.equal(shouldShortlistCandidate(strongResultCard), true);
});

test('mergeCandidateRecords deduplicates by normalized profile URL and upgrades evidence', () => {
  const merged = mergeCandidateRecords([
    normalizeCandidateData({ url: 'https://www.linkedin.com/in/alice/?miniProfileUrn=abc', source: 'google' }, { score: 70, selected: true })
  ], [
    normalizeCandidateData({
      url: 'https://linkedin.com/in/alice',
      source: 'linkedin',
      profile_payload: { name: 'Alice Example', headline: 'Staff Engineer' }
    }, { score: 82 })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, 'https://www.linkedin.com/in/alice');
  assert.equal(merged[0].data_depth, 'full_profile');
  assert.equal(merged[0].profile_payload.name, 'Alice Example');
});

test('mergeCandidateRecords preserves locked manual selection', () => {
  const merged = mergeCandidateRecords([
    normalizeCandidateData({ url: 'https://www.linkedin.com/in/alice', source: 'google' }, {
      score: 80,
      selected: false,
      selection_locked: true
    })
  ], [
    normalizeCandidateData({ url: 'https://linkedin.com/in/alice', source: 'linkedin' }, {
      score: 92,
      selected: true
    })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].selected, false);
  assert.equal(merged[0].selection_locked, true);
});

test('mergeCandidateRecords preserves outreach state across rescoring and upgrades', () => {
  const merged = mergeCandidateRecords([
    normalizeCandidateData({ url: 'https://www.linkedin.com/in/alice', source: 'google' }, {
      score: 72,
      selected: true,
      outreach_state: 'prepared',
      last_action_reason: 'Profile inspected and prepared.',
      last_action_state: 'prepared',
      last_action_at: '2026-06-29T10:00:00.000Z'
    })
  ], [
    normalizeCandidateData({
      url: 'https://linkedin.com/in/alice',
      source: 'linkedin',
      profile_payload: { name: 'Alice Example', headline: 'Staff Engineer' }
    }, {
      score: 91,
      reason: 'Rescored from full profile'
    })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].data_depth, 'full_profile');
  assert.equal(merged[0].score, 91);
  assert.equal(merged[0].outreach_state, 'prepared');
  assert.equal(merged[0].last_action_state, 'prepared');
  assert.equal(merged[0].last_action_reason, 'Profile inspected and prepared.');
});
