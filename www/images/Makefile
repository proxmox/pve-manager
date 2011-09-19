include ../../defines.mk

all:

GNOME_IMAGES = 			\
	display.png		\
	keyboard.png		\
	cdrom.png		\
	network.png		\
	drive-harddisk.png	\
	network-server.png	\
	computer.png

IMAGES = ${GNOME_IMAGES}	\
	computer-on.png		\
	memory.png		\
	processor.png		\
	proxmox_logo.png	\
	network-server-on.png	\
	network-server-off.png	\
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
