PROJECT := ../SignalArchive.xcodeproj
SCHEME  := SignalArchive

.PHONY: build install clean resolve

build:
	xtool build --project $(PROJECT) --scheme $(SCHEME)

install:
	xtool install --project $(PROJECT) --scheme $(SCHEME)

clean:
	xtool clean --project $(PROJECT) --scheme $(SCHEME)

resolve:
	xtool resolve --project $(PROJECT) --scheme $(SCHEME)
