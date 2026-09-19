# The box simulator: a Docker daemon of its own, plus everything
# auto-deploy.sh and bootstrap-wizard.sh shell out to.
#
# Docker-in-Docker rather than the host's socket, because the compose file
# reaches the clone by relative path (../projects/retina). Sharing the host
# daemon would resolve those paths on the host, not in here, and the thing
# under test would no longer be the thing that runs on the box.
FROM docker:28-dind

# docker-cli-compose: `docker compose` is a plugin and dind does not ship it.
# util-linux: flock. diffutils: cmp. coreutils: install with real flags.
RUN apk add --no-cache bash git curl openssl coreutils diffutils util-linux docker-cli-compose

# The box is Ubuntu and this is Alpine. What has to match is the layout the
# scripts assume, not the distribution: ~/projects/retina beside ~/retina.
RUN mkdir -p /home/student/projects /home/student/retina
ENV HOME=/home/student
