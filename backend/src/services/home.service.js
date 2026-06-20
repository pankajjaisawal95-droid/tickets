import pool from "../config/database.js";

/* Section query handlers */
const sectionHandlers = {
  all: (limit) => `
    SELECT
      id AS eventId,
      title,
      banner_url,venue,cart_url ,presented_by,banner_url_mobile,
      start_datetime,
      end_datetime,
      (end_datetime < NOW()) AS is_completed
    FROM events
    WHERE is_active = 1
    ORDER BY start_datetime ASC
    LIMIT ${limit}
  `,

  upcoming: (limit) => `
    SELECT 
      id AS eventId,
      title,
      banner_url,venue,cart_url ,presented_by,banner_url_mobile,
      start_datetime,
      end_datetime,
      (end_datetime < NOW()) AS is_completed
    FROM events
    WHERE start_datetime > NOW()
      AND is_active = 1
    ORDER BY start_datetime ASC
    LIMIT ${limit}
  `,

  active: (limit) => `
    SELECT
      id AS eventId,
      title,
      banner_url,venue,cart_url ,presented_by,banner_url_mobile,
      start_datetime,
      end_datetime,
      (end_datetime < NOW()) AS is_completed
    FROM events
    WHERE start_datetime <= NOW()
      AND end_datetime >= NOW()
      AND is_active = 1
    ORDER BY start_datetime ASC
    LIMIT ${limit}
  `,

  featured: (limit) => `
    SELECT
      id AS eventId,
      title,
      banner_url,venue,cart_url ,presented_by,banner_url_mobile,
      start_datetime,
      end_datetime,
      (end_datetime < NOW()) AS is_completed
    FROM events
    WHERE start_datetime >= NOW()
      AND end_datetime >= NOW()
      AND is_active = 1
    ORDER BY start_datetime ASC
    LIMIT ${limit}
  `,
  completed: (limit) => `
    SELECT
      id AS eventId,
      title,
      banner_url,venue,cart_url ,
      start_datetime, 
      end_datetime,
      (end_datetime < NOW()) AS is_completed
    FROM events
    WHERE end_datetime < NOW()
      AND is_active = 1
    ORDER BY end_datetime DESC
    LIMIT ${limit}
  `
};

export const getHomePageService = async () => {

  const [sections] = await pool.query(`
    SELECT
      hs.id,
      hs.title,
      hs.item_limit,
      hs.layout,
      hst.code AS type
    FROM home_sections hs
    JOIN home_section_types hst
      ON hst.id = hs.type_id
    WHERE hs.status = 1
    ORDER BY hs.sort_order ASC
  `);

  const result = [];

  for (const section of sections) {

    const builder = sectionHandlers[section.type];

    if (!builder) continue;

    const [events] = await pool.query(
      builder(section.item_limit)
    );

    // skip sections with no events so the homepage shows no empty blocks
    if (!events.length) continue;

    result.push({
      sectionId: section.id,
      title: section.title,
      type: section.type,
      layout: section.layout,
      events
    });
  }

  /* ALWAYS-ON HERO
     The homepage hero is driven by any section with a "carousel" (legacy "slider")
     layout. Admin config can leave that empty (e.g. a carousel bound to "upcoming"
     when nothing is upcoming), so the hero silently disappears. To guarantee a hero
     whenever something is live, synthesize a carousel from currently-active events
     and prepend it — but only if the admin hasn't already produced a working one,
     so a configured carousel still wins. */
  const isHeroLayout = (layout) => layout === "carousel" || layout === "slider";
  const hasHero = result.some((s) => isHeroLayout(s.layout));

  if (!hasHero) {
    const [heroEvents] = await pool.query(sectionHandlers.active(5));

    if (heroEvents.length) {
      result.unshift({
        sectionId: "hero-active",
        title: "Featured",
        type: "active",
        layout: "carousel",
        events: heroEvents
      });
    }
  }

  return result;
};