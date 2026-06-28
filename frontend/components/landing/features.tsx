import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import {
  LinkedInIcon,
  PodcastIcon,
  PosterIcon,
  ReelIcon,
  SlideIcon,
  VideoIcon,
  XIcon,
} from "@/components/icons/create-artifacts";

/* ── Decorative background icons (absolutely positioned, low opacity) ── */

const iconBaseClass = "absolute top-2 right-2 w-24 h-24 pointer-events-none";

/* ── Card data ── */
const artifacts = [
  {
    title: "Presentation Decks",
    description:
      "Auto-generated slide decks with images from the research article.",
    bgClass: "bg-saral-plum text-white",
    gridClass: "md:col-span-3",
    icon: <SlideIcon className={`${iconBaseClass} text-white/30`} />,
  },
  {
    title: "Videos",
    description: "Generate videos from the presentation decks.",
    bgClass: "bg-saral-warm-neutral text-[#555]",
    gridClass: "md:col-span-1",
    icon: <VideoIcon className={`${iconBaseClass} text-[#bbb5ad]`} />,
  },
  {
    title: "Podcasts",
    description: "Conversational Podcasts in the language of your choice!",
    bgClass: "bg-saral-gold text-white",
    gridClass: "md:col-span-1",
    icon: <PodcastIcon className={`${iconBaseClass} text-white/30`} />,
  },
  {
    title: "Reels",
    description: "Generate quick 1-minute reels from your research papers.",
    bgClass: "bg-saral-warm-neutral text-[#555]",
    gridClass: "md:col-span-1 md:row-span-2",
    icon: <ReelIcon className={`${iconBaseClass} text-[#bbb5ad]`} />,
  },
  {
    title: "X thread",
    description: "Get a 280-character thread from your research paper",
    bgClass: "bg-saral-warm-neutral text-[#555]",
    gridClass: "md:col-span-1",
    icon: <XIcon className={`${iconBaseClass} text-white/30`} />,
  },
  {
    title: "LinkedIn Post",
    description: "Generate a LinkedIn post from your research paper",
    bgClass: "bg-saral-warm-neutral text-[#555]",
    gridClass: "md:col-span-2",
    icon: <LinkedInIcon className={`${iconBaseClass} text-[#bbb5ad]`} />,
  },
  {
    title: "Conference Posters",
    description: "Auto-generated high-quality posters from your research paper",
    bgClass: "bg-saral-forest text-white",
    gridClass: "md:col-span-2",
    icon: <PosterIcon className={`${iconBaseClass} text-white/25`} />,
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="px-6 py-16 max-sm:py-10 min-h-screen">
      {/* Mobile-only title */}
      <div className="md:hidden text-center mb-6">
        <h2 className="font-serif text-2xl text-ink dark:text-white font-bold leading-tight mb-2">
          Cultivated Output Options
        </h2>
        <p className="text-[14px] text-ink-muted dark:text-white/70 font-sans">
          Upload one paper and convert to any format!
        </p>
      </div>

      <BentoGrid className="max-w-5xl">
        {/* Row 1: Presentation Decks (3) + Videos (1) + Podcasts (1) = 5 */}
        {artifacts.slice(0, 3).map((item, i) => (
          <BentoGridItem
            key={i}
            title={item.title}
            description={item.description}
            header={item.icon}
            className={`${item.gridClass} ${item.bgClass}`}
          />
        ))}

        {/* Row 2: Reels (1, row-span-2) + Title (3) + X thread (1) = 5 */}
        <BentoGridItem
          title={artifacts[3].title}
          description={artifacts[3].description}
          header={artifacts[3].icon}
          className={`${artifacts[3].gridClass} ${artifacts[3].bgClass}`}
        />

        <div className="hidden md:flex md:col-span-3 flex-col items-center justify-center text-center px-4">
          <h2 className="font-serif text-3xl text-ink dark:text-white font-bold leading-tight mb-3">
            Cultivated Output Options
          </h2>
          <p className="text-[15px] text-ink-muted dark:text-white/70 font-sans">
            Upload one paper and convert to any format!
          </p>
        </div>

        <BentoGridItem
          title={artifacts[4].title}
          description={artifacts[4].description}
          header={artifacts[4].icon}
          className={`${artifacts[4].gridClass} ${artifacts[4].bgClass}`}
        />

        {/* Row 3: (Reels continues) + LinkedIn Post (2) + Conference Posters (2) = 5 */}
        {artifacts.slice(5).map((item, i) => (
          <BentoGridItem
            key={i + 5}
            title={item.title}
            description={item.description}
            header={item.icon}
            className={`${item.gridClass} ${item.bgClass}`}
          />
        ))}
      </BentoGrid>
    </section>
  );
}
