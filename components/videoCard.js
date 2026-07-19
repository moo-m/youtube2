// Renders a single video card for the grid/list view, including the
// signature "filmstrip" sprocket-segment progress indicator.

import { el, formatDuration, formatDate } from "../utils/helpers.js";
import { repo } from "../storage/repository.js";
import { showToast } from "./toast.js";

const FILMSTRIP_SEGMENTS = 12;

function buildFilmstrip(pct) {
  const segments = [];
  const filledSegments = pct * FILMSTRIP_SEGMENTS;
  for (let i = 0; i < FILMSTRIP_SEGMENTS; i++) {
    const seg = el("div", { class: "filmstrip-segment" });
    if (i < Math.floor(filledSegments)) {
      seg.classList.add("is-filled");
    } else if (i === Math.floor(filledSegments) && pct > 0) {
      seg.classList.add("is-current");
      const partial = Math.round((filledSegments - Math.floor(filledSegments)) * 100);
      seg.style.setProperty("--seg-fill", `${partial}%`);
    }
    segments.push(seg);
  }
  return el("div", { class: "filmstrip", "aria-hidden": "true" }, segments);
}

/**
 * @param {object} video - video-with-meta (see library/libraryQuery.js)
 * @param {(videoId: string) => void} onOpen
 */
export function createVideoCard(video, onOpen) {
  const card = el("article", {
    class: "video-card",
    tabindex: "0",
    role: "button",
    "aria-label": `${video.title} by ${video.channelTitle}`,
    onClick: () => onOpen(video.id),
    onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(video.id); } },
  });

  const img = el("img", { class: "thumb-img", loading: "lazy", alt: "" });
  img.src = video.thumbnail;
  img.addEventListener("load", () => img.classList.add("is-loaded"));

  const favoriteBadge = el("button", {
    class: "badge badge-favorite",
    dataset: { active: String(video.isFavorite) },
    "aria-label": video.isFavorite ? "Remove from favorites" : "Add to favorites",
    onClick: (e) => { e.stopPropagation(); toggleFlag("favorites", video.id, favoriteBadge, "Added to favorites", "Removed from favorites"); },
  }, "♥");

  const watchLaterBadge = el("button", {
    class: "badge badge-watchlater",
    dataset: { active: String(video.isWatchLater) },
    "aria-label": video.isWatchLater ? "Remove from Watch Later" : "Add to Watch Later",
    onClick: (e) => { e.stopPropagation(); toggleFlag("watchLater", video.id, watchLaterBadge, "Added to Watch Later", "Removed from Watch Later"); },
  }, "◷");

  const badges = el("div", { class: "thumb-badges" }, [favoriteBadge, watchLaterBadge]);

  const indicators = [];
  if (video.isCompleted) indicators.push(el("span", { class: "badge badge-completed", "aria-label": "Completed" }, "●"));
  if (video.isHidden) indicators.push(el("span", { class: "badge badge-hidden", "aria-label": "Hidden" }, "◌̸"));

  const thumbWrap = el("div", { class: "video-card-thumb" }, [
    img,
    el("span", { class: "thumb-duration mono" }, formatDuration(video.durationSeconds)),
    badges,
    indicators.length ? el("div", { class: "thumb-badges thumb-badges-lower" }, indicators) : null,
  ]);

  const body = el("div", { class: "video-card-body" }, [
    el("h3", { class: "card-title" }, video.title),
    el("div", { class: "card-meta" }, [
      el("span", {}, video.channelTitle),
      el("span", { class: "dot" }, "·"),
      el("span", {}, formatDate(video.publishedAt)),
    ]),
  ]);

  const pct = video.progress.pct || 0;
  const filmstrip = buildFilmstrip(pct);
  if (pct > 0) {
    body.appendChild(el("div", { class: "card-pct" }, `${Math.round(pct * 100)}% watched`));
  }

  card.append(thumbWrap, filmstrip, body);
  return card;
}

function toggleFlag(setName, videoId, buttonEl, onMsg, offMsg) {
  const active = repo.toggleFlag(setName, videoId);
  buttonEl.dataset.active = String(active);
  showToast(active ? onMsg : offMsg);
}
