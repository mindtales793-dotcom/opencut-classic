"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Menu02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/utils/ui";

export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const closeMenu = () => setIsMenuOpen(false);

	const links = [
		{ label: "Projetos", href: "/projects" },
		{ label: "Produção", href: "/projects" },
	];

	return (
		<header className="bg-background shadow-background/85 sticky top-0 z-10 shadow-[0_30px_35px_15px_rgba(0,0,0,1)]">
			<div className="relative flex w-full items-center justify-between px-6 pt-4">
				<div className="relative z-10 flex items-center gap-6">
					<Link href="/" className="flex items-center gap-3">
						<div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
							DC
						</div>
						<span className="hidden text-sm font-semibold sm:inline">
							DarkCut Studio
						</span>
					</Link>

					<nav className="hidden items-center gap-4 md:flex">
						{links.map((link) => (
							<Link key={link.label} href={link.href}>
								<Button variant="text" className="p-0 text-sm">
									{link.label}
								</Button>
							</Link>
						))}
					</nav>
				</div>

				<div className="relative z-10">
					<div className="flex items-center gap-3 md:hidden">
						<Button
							variant="text"
							size="icon"
							className="flex items-center justify-center p-0"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
						>
							<HugeiconsIcon icon={Menu02Icon} size={30} />
						</Button>
					</div>
					<div className="hidden items-center gap-3 md:flex">
						<Link href="/projects">
							<Button className="text-sm">
								Abrir editor
								<ArrowRight className="size-4" />
							</Button>
						</Link>
						<ThemeToggle />
					</div>
				</div>

				<div
					className={cn(
						"bg-background/20 pointer-events-none fixed inset-0 opacity-0 backdrop-blur-3xl",
						"transition-opacity duration-150",
						isMenuOpen && "pointer-events-auto opacity-100",
					)}
				>
					<div className="relative h-full">
						<button
							type="button"
							aria-label="Fechar menu"
							className="absolute inset-0"
							onClick={closeMenu}
						/>
						<nav className="flex flex-col gap-3 px-6 pt-[5rem]">
							{links.map((link, index) => (
								<motion.div
									key={link.label}
									initial={{ scale: 0.98, opacity: 0 }}
									animate={{
										scale: isMenuOpen ? 1 : 0.98,
										opacity: isMenuOpen ? 1 : 0,
									}}
									transition={{
										duration: 0.4,
										delay: isMenuOpen ? index * 0.1 : 0,
										ease: [0.25, 0.46, 0.45, 0.94],
									}}
								>
									<Link
										href={link.href}
										className="text-2xl font-semibold"
										onClick={closeMenu}
									>
										{link.label}
									</Link>
								</motion.div>
							))}
						</nav>
						<ThemeToggle
							className="absolute right-8 bottom-8 size-10"
							iconClassName="!size-[1.2rem]"
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
