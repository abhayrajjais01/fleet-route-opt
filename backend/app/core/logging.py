import logging
import sys


def setup_logging(debug: bool = True) -> logging.Logger:
    log_level = logging.DEBUG if debug else logging.INFO
    
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    logger = logging.getLogger("fleet_route_opt")
    logger.setLevel(log_level)
    return logger


logger = setup_logging()
