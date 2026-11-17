import { describe, expect, it } from 'vitest'
import { formatPeriod, formatPeriodShort, parseNumber, formatClock, addMinutesToTime } from '@/lib/format'
import {
  addDays,
  dateInWeek,
  getIsoWeek,
  isoWeekStart,
  isoWeekday,
  isoWeeksInYear,
  nextMeetingDate,
  shiftWeek,
  todayInParis,
  weekInfo,
  weekOf,
} from './isoWeek'
import { computePeriods, defaultSlideSubtitle, defaultSlideTitle, meetingTitle } from './periods'

describe('Semaines ISO 8601', () => {
  it('reconnaît la semaine 47 de 2026 (du 16 au 22 novembre)', () => {
    expect(getIsoWeek('2026-11-16')).toEqual({ year: 2026, week: 47 })
    expect(getIsoWeek('2026-11-17')).toEqual({ year: 2026, week: 47 })
    expect(getIsoWeek('2026-11-22')).toEqual({ year: 2026, week: 47 })
    expect(getIsoWeek('2026-11-23')).toEqual({ year: 2026, week: 48 })
    expect(weekInfo(2026, 47)).toEqual({ year: 2026, week: 47, start: '2026-11-16', end: '2026-11-22' })
  })

  it('retrouve les semaines 42 et 43 du PDF (du 12 au 25 octobre 2026)', () => {
    expect(isoWeekStart(2026, 42)).toBe('2026-10-12')
    expect(weekInfo(2026, 43).end).toBe('2026-10-25')
  })

  it('gère les changements d’année ISO', () => {
    expect(getIsoWeek('2025-12-29')).toEqual({ year: 2026, week: 1 }) // lundi de la S1 2026
    expect(getIsoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 }) // jeudi
    expect(getIsoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 }) // 2026 compte 53 semaines
    expect(getIsoWeek('2027-01-03')).toEqual({ year: 2026, week: 53 })
    expect(getIsoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 })
    expect(getIsoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 })
    expect(getIsoWeek('2021-01-03')).toEqual({ year: 2020, week: 53 })
    expect(getIsoWeek('2023-01-01')).toEqual({ year: 2022, week: 52 })
  })

  it('compte 52 ou 53 semaines par année', () => {
    expect(isoWeeksInYear(2020)).toBe(53)
    expect(isoWeeksInYear(2025)).toBe(52)
    expect(isoWeeksInYear(2026)).toBe(53)
    expect(isoWeeksInYear(2027)).toBe(52)
  })

  it('décale correctement les semaines, y compris en fin d’année', () => {
    expect(shiftWeek({ year: 2026, week: 47 }, -1)).toMatchObject({ year: 2026, week: 46, start: '2026-11-09' })
    expect(shiftWeek({ year: 2026, week: 47 }, 1)).toMatchObject({ year: 2026, week: 48, start: '2026-11-23' })
    expect(shiftWeek({ year: 2026, week: 53 }, 1)).toMatchObject({ year: 2027, week: 1, start: '2027-01-04' })
    expect(shiftWeek({ year: 2027, week: 1 }, -1)).toMatchObject({ year: 2026, week: 53 })
  })

  it('vérifie toutes les semaines de 2015 à 2035 (lundi → dimanche, continuité)', () => {
    let day = '2015-01-05' // lundi S2 2015
    let previous = getIsoWeek('2015-01-04')
    while (day < '2035-12-31') {
      const w = getIsoWeek(day)
      expect(isoWeekday(day)).toBe(1)
      expect(isoWeekStart(w.year, w.week)).toBe(day)
      const expectedNext = previous.week === isoWeeksInYear(previous.year) ? { year: previous.year + 1, week: 1 } : { year: previous.year, week: previous.week + 1 }
      expect(w).toEqual(expectedNext)
      for (let i = 1; i < 7; i++) expect(getIsoWeek(addDays(day, i))).toEqual(w)
      previous = w
      day = addDays(day, 7)
    }
  })

  it('calcule la date de réunion de la semaine et la prochaine occurrence', () => {
    expect(dateInWeek({ year: 2026, week: 47 }, 4)).toBe('2026-11-19')
    expect(nextMeetingDate('2026-11-17', 4)).toBe('2026-11-19') // mardi → jeudi
    expect(nextMeetingDate('2026-11-19', 4, '10:00', '09:00')).toBe('2026-11-19')
    expect(nextMeetingDate('2026-11-19', 4, '10:00', '11:30')).toBe('2026-11-26')
    expect(nextMeetingDate('2026-11-20', 4)).toBe('2026-11-26')
  })

  it('donne la date du jour à Paris', () => {
    expect(todayInParis(new Date('2026-11-17T13:16:00Z'))).toBe('2026-11-17')
    expect(todayInParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
    expect(weekOf(todayInParis(new Date('2026-11-17T13:16:00Z'))).week).toBe(47)
  })
})

describe('Périodes de la réunion', () => {
  const base = { isoYear: 2026, isoWeek: 47, reviewWeeks: 1, forecastReference: 'next' as const }

  it('formate le titre comme dans le cahier des charges', () => {
    expect(meetingTitle({ ...base, title: null })).toBe('Flash Synchro – Semaine 47 – du 16 au 22 novembre 2026')
    expect(meetingTitle({ isoYear: 2026, isoWeek: 44, title: null })).toBe('Flash Synchro – Semaine 44 – du 26 octobre au 1er novembre 2026')
  })

  it('calcule S-1 et S+1', () => {
    const p = computePeriods(base)
    expect(p.review.label).toBe('Semaine 46')
    expect(p.review.range).toBe('du 9 au 15 novembre 2026')
    expect(p.forecast.label).toBe('Semaine 48')
    expect(p.forecast.range).toBe('du 23 au 29 novembre 2026')
    expect(defaultSlideTitle('achievements', p)).toBe('Réalisations S-1')
    expect(defaultSlideTitle('forecast', p)).toBe('Prévisions S+1')
    expect(defaultSlideSubtitle('overview', p)).toBe('Au 9 novembre 2026 — rappel de la situation précédente')
  })

  it('gère une période de deux semaines (vacances)', () => {
    const p = computePeriods({ ...base, isoWeek: 44, reviewWeeks: 2 })
    expect(p.review.label).toBe('Semaines 42 et 43')
    expect(p.review.range).toBe('du 12 au 25 octobre 2026')
    expect(defaultSlideTitle('achievements', p)).toBe('Réalisations des semaines 42 et 43')
    expect(p.stateDate).toBe('2026-10-12')
  })

  it('peut prévoir sur la semaine de la réunion', () => {
    const p = computePeriods({ ...base, forecastReference: 'current' })
    expect(p.forecast.week).toBe(47)
    expect(defaultSlideTitle('forecast', p)).toBe('Prévisions S')
  })
})

describe('Formats français', () => {
  it('formate les périodes', () => {
    expect(formatPeriod('2026-12-28', '2027-01-03')).toBe('du 28 décembre 2026 au 3 janvier 2027')
    expect(formatPeriodShort('2026-11-16', '2026-11-22')).toBe('16–22 nov.')
    expect(formatPeriodShort('2026-10-26', '2026-11-01')).toBe('26 oct.–1er nov.')
  })

  it('analyse les nombres saisis à la française', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5)
    expect(parseNumber('89 %')).toBe(89)
    expect(parseNumber('236/266')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('formate le chronomètre et les horaires', () => {
    expect(formatClock(245_000)).toBe('4:05')
    expect(formatClock(-45_000, { signed: true })).toBe('+0:45')
    expect(addMinutesToTime('10:00', 25)).toBe('10:25')
  })
})
