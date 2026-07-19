import { dailyLog } from "../library/dailyLog.js";
import { repo } from "../storage/repository.js";
import { el, formatHours } from "../utils/helpers.js";

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export class DailyLogView {
  constructor({ onOpenVideo }) {
    this.container = document.getElementById("daily-log-list");
    this.onOpenVideo = onOpenVideo;
  }

  async render() {
    const days = await dailyLog.getGroupedByDay();
    this.container.innerHTML = "";

    if (!days.length) {
      this.container.appendChild(el("div", { class: "empty-state" }, [
        el("p", { class: "empty-title" }, "No activity yet"),
        el("p", { class: "empty-body" }, "Videos you watch will show up here, grouped by day."),
      ]));
      return;
    }

    for (const day of days) {
      const dayCard = el("div", { class: "log-day" }, [
        el("div", { class: "log-day-header" }, [
          el("h3", { class: "log-day-title" }, formatDayLabel(day.date)),
          el("span", { class: "log-day-total mono" }, `${formatHours(day.totalSeconds)} watched`),
        ]),
      ]);

      const list = el("div", { class: "log-day-entries" });
      for (const entry of day.entries) {
        const video = repo.getVideo(entry.videoId);
        if (!video) continue;

        list.appendChild(el("div", {
          class: "log-entry",
          onClick: () => this.onOpenVideo(video.id),
        }, [
          el("img", { class: "log-entry-thumb", src: video.thumbnail, alt: "", loading: "lazy" }),
          el("div", { class: "log-entry-body" }, [
            el("div", { class: "log-entry-title" }, video.title),
            el("div", { class: "log-entry-meta" }, [
              el("span", {}, video.channelTitle),
              el("span", { class: "dot" }, "·"),
              el("span", { class: "mono" }, new Date(entry.openedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })),
            ]),
          ]),
          el("div", { class: "log-entry-duration mono" }, formatHours(entry.secondsWatched)),
        ]));
      }
      dayCard.appendChild(list);
      this.container.appendChild(dayCard);
    }
  }
}
