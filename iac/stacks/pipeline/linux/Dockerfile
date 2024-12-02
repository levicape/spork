ARG IMAGE=debian:11
FROM $IMAGE
COPY ./scripts/bootstrap.sh /tmp/bootstrap.sh
ENV CI=true
RUN sh /tmp/bootstrap.sh && rm -rf /tmp/*
# Todo: bootstrap, toolchain targets
WORKDIR /workspace/bun
COPY bunfig.toml bunfig.toml
COPY package.json package.json
COPY CMakeLists.txt CMakeLists.txt
COPY cmake/ cmake/
COPY scripts/ scripts/
COPY patches/ patches/
COPY *.zig ./
COPY src/ src/
COPY packages/ packages/
COPY test/ test/
RUN curl -fsSL https://get.pulumi.com/ | sh
RUN export PATH=$PATH:$HOME/.pulumi/bin

RUN bun i

COPY ./ci/stacks/toolchain/linux/buildspec.yml ./buildspec.yml

# RUN bun run build:ci