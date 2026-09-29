'use strict';
const { query } = require('../db/pool');

const TTR_MINUTES = { Critical: 20, High: 45, Medium: 90, Low: 180 };
const TFR_MINUTES = { Critical: 180, High: 240, Medium: 720, Low: 1440 };

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}
function minutesDiff(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 60000);
}
function formatDuration(minutes) {
  if (minutes < 60)   return minutes + ' min';
  if (minutes < 1440) return Math.round(minutes / 60 * 10) / 10 + ' hrs';
  return Math.round(minutes / 1440 * 10) / 10 + ' days';
}

async function createSLA(caseId, severity, createdAt) {
  const ttrMins    = TTR_MINUTES[severity] || 90;
  const tfrMins    = TFR_MINUTES[severity] || 720;
  const ttrDeadline = addMinutes(createdAt, ttrMins);
  const tfrDeadline = addMinutes(createdAt, tfrMins);
  await query(`
    INSERT INTO sla_tracking (case_id, severity, ttr_deadline, tfr_deadline)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (case_id) DO NOTHING
  `, [caseId, severity, ttrDeadline, tfrDeadline]);
}

async function updateSLA(caseId, newStatus, changedAt) {
  const { rows } = await query(`SELECT * FROM sla_tracking WHERE case_id = $1`, [caseId]);
  if (!rows[0]) return;
  const sla = rows[0];
  const now = changedAt || new Date();
  const updates = {};
  if (!sla.ttr_met_at && ['In Progress','Resolved','Closed'].includes(newStatus)) {
    updates.ttr_met_at  = now;
    updates.ttr_breached = new Date(now) > new Date(sla.ttr_deadline);
  }
  if (!sla.tfr_met_at && ['Resolved','Closed'].includes(newStatus)) {
    updates.tfr_met_at  = now;
    updates.tfr_breached = new Date(now) > new Date(sla.tfr_deadline);
  }
  if (!Object.keys(updates).length) return;
  const sets   = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = Object.values(updates);
  await query(
    `UPDATE sla_tracking SET ${sets.join(', ')}, updated_at = NOW() WHERE case_id = $1`,
    [caseId, ...values]
  );
}

async function checkBreaches() {
  const now = new Date();
  await query(`UPDATE sla_tracking SET ttr_breached = TRUE, updated_at = NOW() WHERE ttr_met_at IS NULL AND ttr_deadline < $1 AND ttr_breached = FALSE`, [now]);
  await query(`UPDATE sla_tracking SET tfr_breached = TRUE, updated_at = NOW() WHERE tfr_met_at IS NULL AND tfr_deadline < $1 AND tfr_breached = FALSE`, [now]);
}

function getSLAStatus(sla, now = new Date()) {
  if (!sla) return null;
  const ttrMins = TTR_MINUTES[sla.severity] || 90;
  const tfrMins = TFR_MINUTES[sla.severity] || 720;

  const calcStatus = (metAt, deadline, targetMins) => {
    if (metAt) {
      const took = minutesDiff(sla.created_at || sla.sla_created_at, metAt);
      return { status: new Date(metAt) > new Date(deadline) ? 'breached' : 'met', remaining: took };
    }
    const remaining = minutesDiff(now, deadline);
    if (remaining < 0)                    return { status: 'breached', remaining };
    if (remaining < targetMins * 0.25)    return { status: 'warning',  remaining };
    return { status: 'ok', remaining };
  };

  const ttr = calcStatus(sla.ttr_met_at, sla.ttr_deadline, ttrMins);
  const tfr = calcStatus(sla.tfr_met_at, sla.tfr_deadline, tfrMins);

  return {
    severity: sla.severity,
    ttr: { ...ttr, deadline: sla.ttr_deadline, met_at: sla.ttr_met_at, breached: sla.ttr_breached, target: ttrMins, label: formatDuration(ttrMins) },
    tfr: { ...tfr, deadline: sla.tfr_deadline, met_at: sla.tfr_met_at, breached: sla.tfr_breached, target: tfrMins, label: formatDuration(tfrMins) },
  };
}

module.exports = { createSLA, updateSLA, checkBreaches, getSLAStatus, TTR_MINUTES, TFR_MINUTES, formatDuration };
