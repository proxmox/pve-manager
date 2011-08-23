include $(top_builddir)/common.mk

GNOME_IMAGES = 			\
	display.png		\
	keyboard.png		\
	cdrom.png		\
	network.png		\
	drive-harddisk.png	\
	network-server.png	\
	computer.png

images_DATA = ${GNOME_IMAGES}	\
	computer-on.png		\
	memory.png		\
	processor.png		\
	proxmox_logo.png	\
	blank.gif

imagesdir = ${WWW_IMAGEDIR}

install-data-hook:
	chown -R www-data:www-data ${DESTDIR}/${imagesdir}

CLEANFILES=*~

