include ../../../defines.mk

all:

.PHONY: install 
install: README fontawesome-webfont.ttf FontAwesome.otf fontawesome-webfont.woff2 fontawesome-webfont.svg fontawesome-webfont.woff fontawesome-webfont.eot
	install -d ${WWWFONTSDIR}
	install -m 0644 $? ${WWWFONTSDIR}

.PHONY: clean
clean:
	rm -rf *~
