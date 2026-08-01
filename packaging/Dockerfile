# JurisCore on-prem container image.
#
# The build context is the staged release package produced by
# `bun scripts/package-release.mjs` — the same tree that ships in
# juriscore-<version>.zip, with every dependency already traced and vendored
# into server/node_modules at build time. The image therefore installs nothing:
# `docker build` needs no registry beyond the base image, and `docker run` needs
# no network at all.
FROM oven/bun:1-alpine

WORKDIR /app
COPY . /app

ENV PORT=8080
EXPOSE 8080

# Run as the image's unprivileged user rather than root.
USER bun

CMD ["bun", "run", "./server/index.mjs"]
