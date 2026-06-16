import React from "react";

export function DocsLayoutShared({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mk-bg flex flex-col">
      {children}
    </div>
  );
}
