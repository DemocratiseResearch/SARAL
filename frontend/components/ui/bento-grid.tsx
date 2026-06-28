import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[13rem] md:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "group/bento relative row-span-1 flex flex-col justify-end overflow-hidden rounded-2xl p-6 transition duration-200",
        className,
      )}
    >
      {/* Decorative icon */}
      {header}
      <div className="relative z-10">
        {icon}
        <div className="mt-1 mb-1 font-serif text-xl font-bold leading-tight">
          {title}
        </div>
        <div className="font-sans text-[13px] font-normal leading-relaxed opacity-85">
          {description}
        </div>
      </div>
    </div>
  );
};
