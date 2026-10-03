package domain

import (
	"time"
	_ "time/tzdata" // shift_days resolves IANA zones even where the host has no zoneinfo
)

// CheckBlockInItem enforces that a work block lies within its item's planning range:
// on or after open_at and ending by deadline_at. Missing dates do not constrain.
func CheckBlockInItem(it Item, start, end time.Time) error {
	if it.OpenAt != nil && start.Before(*it.OpenAt) {
		return invalid("start_at", "work block must start on or after the item's open date")
	}
	if it.DeadlineAt != nil && end.After(*it.DeadlineAt) {
		return invalid("end_at", "work block must end by the item's deadline")
	}
	return nil
}

func shiftLocal(t time.Time, days int, loc *time.Location) time.Time {
	return t.In(loc).AddDate(0, 0, days).UTC()
}

// ApplyItemPatchWithBlocks applies p to it and its work blocks together:
//   - shift_days (with time_zone) moves the item's dates and all its blocks by whole local days;
//   - any change to the dates is refused if it would leave a block outside the range.
//
// Edits that do not touch dates never look at blocks, so items with older
// out-of-range blocks stay editable.
func ApplyItemPatchWithBlocks(it Item, blocks []WorkBlock, p ItemPatch, now time.Time) (Item, []WorkBlock, error) {
	datesSet := p.OpenAt.Set || p.DeadlineAt.Set
	days := 0
	var loc *time.Location
	if p.ShiftDays.Set {
		if p.ShiftDays.Null {
			return it, blocks, invalid("shift_days", "shift_days must be a number")
		}
		if datesSet {
			return it, blocks, invalid("shift_days", "shift_days cannot be combined with open_at or deadline_at")
		}
		if !p.TimeZone.Set || p.TimeZone.Null || p.TimeZone.Value == "" {
			return it, blocks, invalid("time_zone", "time_zone is required with shift_days")
		}
		var err error
		if loc, err = time.LoadLocation(p.TimeZone.Value); err != nil {
			return it, blocks, invalid("time_zone", "time_zone is not a known IANA zone")
		}
		days = p.ShiftDays.Value
	}

	next, err := ApplyItemPatch(it, p, now)
	if err != nil {
		return it, blocks, err
	}
	out := append([]WorkBlock(nil), blocks...)
	if days != 0 {
		if next.OpenAt != nil {
			o := shiftLocal(*next.OpenAt, days, loc)
			next.OpenAt = &o
		}
		if next.DeadlineAt != nil {
			d := shiftLocal(*next.DeadlineAt, days, loc)
			next.DeadlineAt = &d
		}
		for i := range out {
			out[i].StartAt = shiftLocal(out[i].StartAt, days, loc)
			out[i].EndAt = shiftLocal(out[i].EndAt, days, loc)
		}
	}
	if datesSet || days != 0 {
		for _, b := range out {
			if next.OpenAt != nil && b.StartAt.Before(*next.OpenAt) {
				return it, blocks, invalid("open_at", "scheduled work blocks would fall before the open date")
			}
			if next.DeadlineAt != nil && b.EndAt.After(*next.DeadlineAt) {
				return it, blocks, invalid("deadline_at", "scheduled work blocks would fall after the deadline")
			}
		}
	}
	return next, out, nil
}
