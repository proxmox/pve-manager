include ../../defines.mk

all:

# start.png /usr/share/icons/gnome/16x16/actions/media-playback-start.png
# stop.png /usr/share/icons/gnome/16x16/actions/media-playback-stop.png
GNOME_IMAGES = 			\
	start.png		\
	stop.png		\
	gtk-stop.png		\
	forward.png		\
	display.png		\
	keyboard.png		\
	cdrom.png		\
	network.png		\
	drive-harddisk.png	\
	network-server.png	\
	connect_established.png	\
	computer.png

IMAGES = ${GNOME_IMAGES}	\
	snapshot.png		\
	now.png			\
	computer-on.png		\
	memory.png		\
	processor.png		\
	proxmox_logo.png	\
	network-server-on.png	\
	network-server-off.png	\
	openvz-on.png		\
	openvz-off.png		\
	blank.gif

.PHONY: install 
install: ${IMAGES}
	install -d ${WWWIMAGEDIR}
	install -m 0644 -o www-data -g www-data ${IMAGES} ${WWWIMAGEDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~
